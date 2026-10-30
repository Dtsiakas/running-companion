import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { getBodyReport } from '@companion/insights';

const START = Date.UTC(2026, 0, 1);
const dateOf = (i: number) => new Date(START + i * 86_400_000).toISOString().slice(0, 10);
const LAST = dateOf(59);

/** 60 days of weight trend, changing by `perDay` kg a day from 75 kg, with a goal of 70 kg. */
function seed(perDay: number | null) {
  const db = openDatabase(':memory:');
  upsert(db, 'profile_snapshots', ['calendar_date'], { calendar_date: dateOf(0), time_zone: 'UTC', weight_goal_kg: 70, updated_at: 0 });
  for (let i = 0; i < 60; i++) {
    upsert(db, 'daily_metrics', ['calendar_date'], { calendar_date: dateOf(i), load: i % 7 === 0 ? 0 : 60, weight_trend_kg: perDay === null ? null : 75 + perDay * i, computed_at: 0 });
  }
  return db;
}

test('a slow loss toward the goal is sustainable and gets a projected date', () => {
  const { weight, nutrition } = getBodyReport(seed(-0.03), LAST); // about 0.2 kg a week, under 0.3% of body weight
  assert.equal(weight?.tone, 'good');
  assert.match(weight!.assessment, /sustainable/);
  assert.ok(weight!.projected_goal_date && weight!.projected_goal_date > LAST);
  assert.equal(nutrition?.weight_kg, 73.2);
});

test('losing more than 1% of body weight a week is flagged', () => {
  const { weight } = getBodyReport(seed(-0.15), LAST); // about 1 kg a week from ~66 kg
  assert.equal(weight?.tone, 'concern');
  assert.match(weight!.assessment, /faster than/);
  assert.equal(weight!.projected_goal_date, null);
});

test('a steady weight reads as steady, with no projection', () => {
  const { weight } = getBodyReport(seed(0), LAST);
  assert.equal(weight?.tone, 'neutral');
  assert.match(weight!.assessment, /steady/);
});

test('no weigh-ins means no weight section and no weight-based ranges', () => {
  const report = getBodyReport(seed(null), LAST);
  assert.equal(report.weight, null);
  assert.equal(report.nutrition, null);
});
