import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { generateDemo } from '@companion/demo';
import { getPatterns, getSignals } from '@companion/insights';
import { computeMetrics } from '@companion/metrics';

const START = Date.UTC(2026, 0, 1);
const dateOf = (i: number) => new Date(START + i * 86_400_000).toISOString().slice(0, 10);

/**
 * 120 synthetic days for a steady person: HRV ~80 ms, resting HR ~40, breathing ~10.5, bed at 23:00 or 01:00 on
 * alternate nights. Late nights cost 10 sleep-score points (planted on purpose); everything else is noise.
 */
function seed(lastDay: Partial<{ rhr: number; hrv: number; breathing: number }> = {}) {
  const db = openDatabase(':memory:');
  upsert(db, 'profile_snapshots', ['calendar_date'], { calendar_date: dateOf(0), time_zone: 'UTC', updated_at: 0 });
  for (let i = 0; i < 120; i++) {
    const date = dateOf(i);
    const wobble = Math.sin(i * 1.7);
    const late = i % 2 === 0;
    const last = i === 119;
    upsert(db, 'daily_metrics', ['calendar_date'], {
      calendar_date: date,
      load: i % 7 === 0 ? 0 : 60,
      form: -5,
      acwr: 1,
      hrv_ms: last && lastDay.hrv ? lastDay.hrv : 80 + 6 * wobble,
      rhr: last && lastDay.rhr ? lastDay.rhr : Math.round(40 + wobble),
      rhr_3d: 40,
      rhr_baseline: 40,
      hrv_z: 0,
      sleep_h: 7.5,
      sleep_debt_7d_h: 1,
      computed_at: 0,
    });
    upsert(db, 'sleep', ['calendar_date'], {
      calendar_date: date,
      start_time: START + i * 86_400_000 - (late ? -60 : 60) * 60_000, // 01:00 or 23:00 UTC
      score: Math.round((late ? 65 : 75) + 3 * wobble),
      avg_respiration: last && lastDay.breathing ? lastDay.breathing : 10.5 + 0.3 * wobble,
      updated_at: 0,
    });
    upsert(db, 'daily_wellness', ['calendar_date'], { calendar_date: date, stress_avg: 20 + Math.round(5 * wobble), body_battery_max: 85, updated_at: 0 });
  }
  return db;
}

test('a normal day raises no warnings', () => {
  const signals = getSignals(seed(), dateOf(119));
  assert.deepEqual(signals.filter((s) => s.level === 'warning'), []);
  assert.equal(signals.find((s) => s.id === 'illness-watch'), undefined);
});

test('resting heart rate up, HRV down and breathing up together trigger the illness warning', () => {
  const signals = getSignals(seed({ rhr: 45, hrv: 55, breathing: 12 }), dateOf(119));
  const illness = signals.find((s) => s.id === 'illness-watch');
  assert.equal(illness?.level, 'warning');
  assert.match(illness!.detail, /resting heart rate 45 bpm/);
  assert.match(illness!.detail, /breathing rate 12/);
  assert.equal(signals[0]?.id, 'illness-watch', 'warnings come first');
});

test('one shifted marker alone is noise, not a signal', () => {
  const signals = getSignals(seed({ rhr: 45 }), dateOf(119));
  assert.equal(signals.find((s) => s.id === 'illness-watch'), undefined);
});

test('patterns find the planted late-bedtime effect, and report a missing one honestly', () => {
  const patterns = getPatterns(seed(), dateOf(119));
  const bedtime = patterns.find((p) => p.id === 'bedtime')!;
  const score = bedtime.results.find((r) => r.outcome === 'Sleep score')!;
  assert.equal(score.status, 'effect');
  assert.match(score.difference, /^10 points lower$/);
  assert.equal(score.strength, 'strong');
  // Body Battery is a flat 85 in the data: no difference, stated as such.
  assert.equal(bedtime.results.find((r) => r.outcome === 'Body Battery in the morning')!.status, 'no_effect');
  // Nothing in the app depends on typed-in data any more: no pattern is built on check-in tags.
  assert.equal(patterns.some((p) => p.id.startsWith('tag-')), false);
  assert.equal(patterns[0]!.status, 'effect', 'findings are listed first');
});

test('patterns leave out outcomes a watch never records', () => {
  const db = openDatabase(':memory:');
  generateDemo(db, { today: '2026-10-30', days: 120, missing: ['hrv', 'battery-events'], now: 0 });
  computeMetrics(db, { today: '2026-10-30' });
  const outcomes = getPatterns(db, '2026-10-30').flatMap((p) => p.results.map((r) => r.outcome));
  assert.ok(outcomes.length > 0);
  assert.ok(!outcomes.some((o) => /HRV|recharge/i.test(o)), outcomes.join(', '));
});
