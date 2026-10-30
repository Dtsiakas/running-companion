import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '@companion/db';
import { generateDemo } from '@companion/demo';
import { computeMetrics } from '@companion/metrics';
import { getToday } from '@companion/queries';

const count = (db: ReturnType<typeof openDatabase>, sql: string) => Number((db.prepare(sql).get() as { n: number }).n);

test('the demo runner fills every table a sync would, and the same seed gives the same data', () => {
  const make = () => {
    const db = openDatabase(':memory:');
    generateDemo(db, { today: '2026-10-30', days: 70, timeZone: 'Europe/Rome', now: 0 });
    computeMetrics(db, { today: '2026-10-30' });
    return db;
  };
  const db = make();
  const runs = count(db, `SELECT COUNT(*) n FROM activities`);
  assert.ok(runs > 30 && runs < 50, `about four runs a week, got ${runs}`);
  for (const table of ['activity_records', 'activity_laps', 'activity_weather', 'daily_wellness', 'sleep', 'hrv', 'weigh_ins', 'profile_snapshots', 'daily_metrics']) {
    assert.ok(count(db, `SELECT COUNT(*) n FROM ${table}`) > 0, `${table} has rows`);
  }
  assert.equal(count(db, `SELECT COUNT(*) n FROM daily_wellness`), 70);
  // Physiology the insights rely on: easy runs well below threshold heart rate.
  const easy = db.prepare(`SELECT AVG(avg_hr) hr FROM activities WHERE workout_name = 'Base'`).get() as { hr: number };
  assert.ok(easy.hr > 130 && easy.hr < 155, `easy runs average ${easy.hr} bpm`);
  assert.ok(getToday(db, '2026-10-30')?.recovery?.hrv_7d_ms);

  const again = make();
  const rows = (d: typeof db) => d.prepare('SELECT distance_m, avg_hr FROM activities ORDER BY activity_id').all();
  assert.deepEqual(rows(again), rows(db));
});

test('left-out streams are really absent', () => {
  const db = openDatabase(':memory:');
  generateDemo(db, { today: '2026-10-30', days: 21, missing: ['hrv', 'scale', 'power', 'dynamics', 'gps', 'battery-events'], now: 0 });
  assert.equal(count(db, 'SELECT COUNT(*) n FROM hrv'), 0);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM weigh_ins'), 0);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM activity_records WHERE power_w IS NOT NULL OR gct_ms IS NOT NULL OR lat IS NOT NULL'), 0);
  assert.equal(count(db, 'SELECT COUNT(*) n FROM daily_wellness WHERE bb_sleep IS NOT NULL'), 0);
});
