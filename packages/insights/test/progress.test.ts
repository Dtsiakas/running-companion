import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { getFormTrend, getProgress, getYearReview, weekOf } from '@companion/insights';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 17); // Monday 5 January 2026, 19:00 in Athens
const dateOf = (i: number) => new Date(START + i * DAY).toISOString().slice(0, 10);

/**
 * Runs on Monday, Wednesday and Saturday for 20 weeks: 8 km, 6 km and a long run growing from 10 to 19 km.
 * Weight 70 kg, resting heart rate 42.
 */
function seed() {
  const db = openDatabase(':memory:');
  upsert(db, 'profile_snapshots', ['calendar_date'], { calendar_date: dateOf(0), time_zone: 'Europe/Athens', updated_at: 0 });
  let id = 1;
  for (let week = 0; week < 20; week++) {
    for (const [offset, km] of [[0, 8], [2, 6], [5, 10 + Math.min(9, Math.floor(week / 2))]] as const) {
      const i = week * 7 + offset;
      upsert(db, 'activities', ['activity_id'], { activity_id: id, type_key: 'running', start_time: START + i * DAY, start_time_local: `${dateOf(i)}T19:00:00`, calendar_date: dateOf(i), distance_m: km * 1000, duration_s: km * 330, elevation_gain_m: 20, updated_at: 0 });
      id++;
    }
  }
  for (let i = 0; i < 140; i++) upsert(db, 'daily_metrics', ['calendar_date'], { calendar_date: dateOf(i), load: 0, weight_trend_kg: 70, rhr: 42, computed_at: 0 });
  return db;
}

test('progress: totals, milestones with dates, records and streaks', () => {
  const db = seed();
  const p = getProgress(db, dateOf(139));
  assert.equal(p.totals.runs, 60);
  assert.ok(p.milestones.some((m) => m.title === '50 runs'));
  assert.ok(p.milestones.some((m) => m.title === '500 km in total'));
  assert.equal(p.records.longest_run?.km, 19);
  assert.equal(p.records.streak_any.best, 20);
  assert.equal(p.records.streak_three.current, 20);
  assert.equal(p.next.find((n) => n.unit === 'runs')?.target, 100);
  assert.equal(weekOf('2026-01-11'), '2026-01-05', 'Sunday belongs to the week that started on Monday');
});

test('year in review: volume, weeks with runs, evening runner', () => {
  const db = seed();
  const y = getYearReview(db, 2026, dateOf(139))!;
  assert.equal(y.runs, 60);
  assert.equal(y.weeks_with_runs, 20);
  assert.equal(y.time_of_day.evening, 60);
  assert.equal(y.complete, false);
  assert.equal(getYearReview(db, 2030, dateOf(139)), null);
});

test('form: months are compared at the same pace, so running faster alone doesn’t look like better form', () => {
  const db = openDatabase(':memory:');
  let id = 1;
  // Six months; each month's runs get faster, and cadence follows speed exactly (+10 spm per m/s), nothing else changes.
  for (let month = 0; month < 6; month++) {
    for (let run = 0; run < 4; run++) {
      const speed = 2.6 + month * 0.1 + run * 0.05;
      const date = `2025-${String(month + 1).padStart(2, '0')}-${String(run * 5 + 2).padStart(2, '0')}`;
      upsert(db, 'activities', ['activity_id'], { activity_id: id, type_key: 'running', start_time: Date.parse(`${date}T07:00:00Z`), start_time_local: `${date}T09:00:00`, calendar_date: date, avg_speed_mps: speed, avg_cadence_spm: 150 + 10 * speed, avg_gct_ms: 260, avg_step_length_mm: 1000, updated_at: 0 });
      upsert(db, 'activity_metrics', ['activity_id'], { activity_id: id, metrics_version: 1, category: 'easy', category_source: 'test', is_treadmill: 0, computed_at: 0 });
      id++;
    }
  }
  const form = getFormTrend(db, '2025-12-31')!;
  const cadence = form.measures.cadence;
  assert.equal(cadence.points.length, 6);
  assert.equal(cadence.per_speed, 10);
  assert.equal(new Set(cadence.points.map((p) => p.value)).size, 1, 'every month is the same at the reference pace');
  assert.equal(cadence.direction, 'steady');
  assert.equal(cadence.basis, 'first_months', 'six months of data: no year-ago window yet');
});

test('form: a year later the comparison is year on year, and empty months stay as gaps', () => {
  const db = openDatabase(':memory:');
  let id = 1;
  // Jan–Mar 2025 at cadence 170, nothing for eight months, then Dec 2025–Mar 2026 at 176. Same pace throughout.
  const months = ['2025-01', '2025-02', '2025-03', '2025-12', '2026-01', '2026-02', '2026-03'];
  for (const month of months) {
    for (let run = 0; run < 3; run++) {
      const date = `${month}-${String(run * 7 + 3).padStart(2, '0')}`;
      upsert(db, 'activities', ['activity_id'], { activity_id: id, type_key: 'running', start_time: Date.parse(`${date}T07:00:00Z`), start_time_local: `${date}T09:00:00`, calendar_date: date, avg_speed_mps: 2.9 + run * 0.02, avg_cadence_spm: month < '2025-06' ? 170 : 176, avg_gct_ms: 255, avg_step_length_mm: 1000, updated_at: 0 });
      upsert(db, 'activity_metrics', ['activity_id'], { activity_id: id, metrics_version: 1, category: 'easy', category_source: 'test', is_treadmill: 0, computed_at: 0 });
      id++;
    }
  }
  const cadence = getFormTrend(db, '2026-03-31')!.measures.cadence;
  assert.equal(cadence.points.length, 15, 'January 2025 to March 2026, every month');
  assert.equal(cadence.points.find((p) => p.month === '2025-07')?.value, null);
  assert.equal(cadence.basis, 'year_ago');
  assert.equal(cadence.first, 170);
  assert.equal(cadence.last, 176);
  assert.equal(cadence.direction, 'better');
});
