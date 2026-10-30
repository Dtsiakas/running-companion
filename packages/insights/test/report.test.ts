import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { getWeeklyReport } from '@companion/insights';

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 7); // Monday 7 September 2026
const dateOf = (i: number) => new Date(START + i * DAY).toISOString().slice(0, 10);

/**
 * Five weeks of three easy 10 km runs (Monday, Wednesday, Friday) and steady recovery. The last week's Friday run
 * holds a 5 km effort faster than any before it.
 */
function seed() {
  const db = openDatabase(':memory:');
  let id = 1;
  for (let i = 0; i < 35; i++) {
    const date = dateOf(i);
    const runDay = [0, 2, 4].includes(i % 7);
    upsert(db, 'daily_metrics', ['calendar_date'], {
      calendar_date: date,
      load: runDay ? 70 : 0,
      form: -8,
      fitness: 35,
      hrv_ms: 80,
      rhr: 40,
      sleep_h: 7.5,
      sleep_need_h: 7.5,
      status: 'green',
      computed_at: 0,
    });
    if (!runDay) continue;
    upsert(db, 'activities', ['activity_id'], {
      activity_id: id,
      name: 'Easy',
      type_key: 'running',
      start_time: START + i * DAY,
      start_time_local: `${date}T07:00:00`,
      calendar_date: date,
      distance_m: 10_000,
      duration_s: 3300,
      avg_speed_mps: 3.03,
      avg_hr: 140,
      updated_at: 0,
    });
    upsert(db, 'activity_metrics', ['activity_id'], {
      activity_id: id,
      metrics_version: 1,
      category: 'easy',
      category_source: 'workout',
      is_treadmill: 0,
      low_s: 3300,
      moderate_s: 0,
      high_s: 0,
      computed_at: 0,
    });
    upsert(db, 'activity_best_efforts', ['activity_id', 'distance_m'], { activity_id: id, distance_m: 5000, duration_s: i === 32 ? 1450 : 1500 });
    id++;
  }
  return db;
}

test('a finished week: steady volume, the easy balance praised, a new all-time best found', () => {
  const report = getWeeklyReport(seed(), '2026-10-05', '2026-10-20')!;
  assert.equal(report.complete, true);
  assert.equal(report.headline, 'A steady week.');
  assert.match(report.training[0]!.text, /^3 runs, 30 km in .*in line with your average week of the last four \(30 km\)\.$/);
  assert.equal(report.training.find((l) => l.text.includes('easy'))?.tone, 'good');
  assert.deepEqual(report.bests, [{ distance: '5 km', time: '24:10', scope: 'all-time', activity_id: 15, date: '2026-10-09' }]);
  assert.match(report.recovery.find((l) => l.text.startsWith('Recovery status'))!.text, /7 green, 0 amber, 0 red/);
});

test('an unfinished week is compared with the same days of a usual week, not a whole one', () => {
  // Wednesday of the last week: two runs (Monday, Wednesday) done, 20 km against a usual 30 km × 3/7.
  const report = getWeeklyReport(seed(), '2026-10-05', '2026-10-07')!;
  assert.equal(report.complete, false);
  assert.match(report.headline, /^So far, /);
  assert.match(report.training[0]!.text, /your usual for the first 3 days of a week \(12\.9 km\)/);
});

test('a week without data has no report', () => {
  assert.equal(getWeeklyReport(seed(), '2027-01-04', '2027-01-10'), null);
});
