import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate, upsert } from '@companion/db';
import { createI18n } from '@companion/i18n';
import { getNutrition, logMeal } from '@companion/insights';

/** A week of training at 70 kg: daily load and Garmin's burn, with meals on some days. */
function setup() {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  for (let d = 1; d <= 14; d++) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    upsert(db, 'daily_metrics', ['calendar_date'], { calendar_date: date, load: d % 2 ? 120 : 0, weight_trend_kg: 70, computed_at: 0 });
    upsert(db, 'daily_wellness', ['calendar_date'], { calendar_date: date, calories_total: d % 2 ? 3200 : 2300, updated_at: 0 });
  }
  return db;
}

const meal = (date: string, kcal: number, protein_g: number, carbs_g: number) => ({ date, description: 'meal', kcal, protein_g, carbs_g, fat_g: 20 });

test('targets follow the day’s training, and partial days stay out of the feedback', () => {
  const db = setup();
  logMeal(db, meal('2026-11-13', 800, 40, 100));
  const today = getNutrition(db, '2026-11-13');
  assert.equal(today.targets?.day_type, 'hard');
  assert.deepEqual(today.targets?.protein_g, [100, 140]);
  assert.deepEqual(today.targets?.carbs_g, [420, 700]);
  assert.equal(today.days.at(-1)?.partial, true);
  // Nothing else logged: no feedback beyond asking for more days.
  assert.equal(today.feedback.length, 1);
  assert.equal(today.feedback[0]?.tone, 'neutral');
});

test('low protein, low carbohydrate on hard days and big gaps on training days are flagged', () => {
  const db = setup();
  for (let d = 7; d <= 13; d++) logMeal(db, meal(`2026-11-${String(d).padStart(2, '0')}`, 1800, 70, 250));
  const { feedback } = getNutrition(db, '2026-11-14');
  const text = feedback.map((item) => item.text).join(' ');
  assert.match(text, /Protein was below 100 g on 7 of your last 7/);
  assert.match(text, /hard days/);
  assert.match(text, /ate about 1,400 kcal less than you burned/);
  assert.ok(feedback.every((item) => item.tone === 'concern'));
});

test('a well-fuelled week gets one good line, in Greek too', () => {
  const db = setup();
  for (let d = 7; d <= 13; d++) logMeal(db, meal(`2026-11-${String(d).padStart(2, '0')}`, d % 2 ? 3100 : 2400, 120, d % 2 ? 480 : 300));
  assert.deepEqual(getNutrition(db, '2026-11-14').feedback.map((item) => item.tone), ['good']);
  assert.match(getNutrition(db, '2026-11-14', createI18n({ lang: 'el' })).feedback[0]!.text, /πρωτεΐνη/);
});
