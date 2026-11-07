import type { DatabaseSync } from 'node:sqlite';
import { ENGLISH, type I18n } from '@companion/i18n';
import { addDays } from './days.ts';
import { dailyRanges, type Range } from './fuel.ts';

/**
 * The food log. Meals are written only when the user asks Claude to log one (the log_meal tool); everything here
 * reads them back as daily totals next to what the day's training asked for.
 *
 * The amounts are estimates from photos and descriptions, and a day is only as complete as what was logged. So the
 * feedback skips days that look partly logged (under 1,200 kcal) and never treats a missing day as eating nothing.
 */

type Row = Record<string, unknown>;
const round = (value: number) => Math.round(value);
/** Less than this logged in a day: probably not everything was logged. */
export const PARTIAL_DAY_KCAL = 1200;
/** Eating this much less than Garmin's burn estimate on a training day counts as under-fuelled. */
const UNDER_FUELED_KCAL = 750;
const FEEDBACK_DAYS = 7;

export interface MealInput {
  date: string;
  time?: string | null;
  description: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface Meal extends MealInput {
  meal_id: number;
  time: string | null;
}

export function logMeal(db: DatabaseSync, meal: MealInput, now = Date.now()): Meal {
  const result = db
    .prepare('INSERT INTO meals (calendar_date, time, description, kcal, protein_g, carbs_g, fat_g, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(meal.date, meal.time ?? null, meal.description.trim(), round(meal.kcal), round(meal.protein_g), round(meal.carbs_g), round(meal.fat_g), now);
  return { ...meal, meal_id: Number(result.lastInsertRowid), time: meal.time ?? null, kcal: round(meal.kcal), protein_g: round(meal.protein_g), carbs_g: round(meal.carbs_g), fat_g: round(meal.fat_g) };
}

/** Removes one meal. False when there was no such meal. */
export function deleteMeal(db: DatabaseSync, mealId: number): boolean {
  return Number(db.prepare('DELETE FROM meals WHERE meal_id = ?').run(mealId).changes) > 0;
}

export type DayType = 'rest' | 'moderate' | 'hard';

export interface FoodDay {
  date: string;
  meals: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Garmin's estimate of everything burned that day (null until the day's wellness data is synced). */
  burned_kcal: number | null;
  day_type: DayType;
  /** Under 1,200 kcal logged: probably not everything was logged, so it's left out of the feedback. */
  partial: boolean;
}

export interface Feedback {
  tone: 'good' | 'concern' | 'neutral';
  text: string;
}

export type Nutrition = ReturnType<typeof getNutrition>;

/** One day's meals and totals, the last 14 days, and what they add up to. */
export function getNutrition(db: DatabaseSync, date: string, i18n: I18n = ENGLISH) {
  const meals = (db.prepare('SELECT meal_id, calendar_date, time, description, kcal, protein_g, carbs_g, fat_g FROM meals WHERE calendar_date = ? ORDER BY time IS NULL, time, meal_id').all(date) as Row[]).map((r) => ({
    meal_id: Number(r.meal_id),
    time: r.time === null ? null : String(r.time),
    description: String(r.description),
    kcal: Number(r.kcal),
    protein_g: Number(r.protein_g),
    carbs_g: Number(r.carbs_g),
    fat_g: Number(r.fat_g),
  }));
  const days = foodDays(db, addDays(date, -13), date);
  const weight = (db.prepare('SELECT weight_trend_kg AS w FROM daily_metrics WHERE calendar_date <= ? AND weight_trend_kg IS NOT NULL ORDER BY calendar_date DESC LIMIT 1').get(date) as Row | undefined)?.w;
  const ranges = weight === undefined || weight === null ? null : dailyRanges(Number(weight));
  const day = days.at(-1)!;
  return {
    date,
    meals,
    totals: { kcal: day.kcal, protein_g: day.protein_g, carbs_g: day.carbs_g, fat_g: day.fat_g },
    /** The day's targets for the user's weight: protein, and carbohydrate for the kind of training the day had so far. */
    targets: ranges ? { protein_g: ranges.protein_g, carbs_g: ranges.carbs_g[day.day_type], day_type: day.day_type } : null,
    days,
    feedback: ranges ? feedback(db, days.slice(0, -1), ranges, i18n) : [],
    note: i18n.m.food.estimateNote,
  };
}

/** Daily totals for every day in the range, logged or not, with Garmin's burn and the kind of training day. */
function foodDays(db: DatabaseSync, from: string, to: string): FoodDay[] {
  const logged = new Map(
    (db.prepare('SELECT calendar_date AS d, COUNT(*) AS n, SUM(kcal) AS kcal, SUM(protein_g) AS p, SUM(carbs_g) AS c, SUM(fat_g) AS f FROM meals WHERE calendar_date BETWEEN ? AND ? GROUP BY calendar_date').all(from, to) as Row[]).map(
      (r) => [String(r.d), r],
    ),
  );
  const context = new Map(
    (
      db
        .prepare('SELECT d.calendar_date AS d, d.load, w.calories_total AS burned FROM daily_metrics d LEFT JOIN daily_wellness w USING (calendar_date) WHERE d.calendar_date BETWEEN ? AND ?')
        .all(from, to) as Row[]
    ).map((r) => [String(r.d), r]),
  );
  const result: FoodDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = logged.get(d);
    const ctx = context.get(d);
    const load = Number(ctx?.load ?? 0);
    const kcal = round(Number(row?.kcal ?? 0));
    result.push({
      date: d,
      meals: Number(row?.n ?? 0),
      kcal,
      protein_g: round(Number(row?.p ?? 0)),
      carbs_g: round(Number(row?.c ?? 0)),
      fat_g: round(Number(row?.f ?? 0)),
      burned_kcal: ctx?.burned ? round(Number(ctx.burned)) : null,
      day_type: load >= 100 ? 'hard' : load > 0 ? 'moderate' : 'rest',
      partial: kcal < PARTIAL_DAY_KCAL,
    });
  }
  return result;
}

/** What the last week of fully logged days says. Past days only: today isn't over. */
function feedback(db: DatabaseSync, past: FoodDay[], ranges: ReturnType<typeof dailyRanges>, { m, f }: I18n): Feedback[] {
  const t = m.food.feedback;
  const full = past.slice(-FEEDBACK_DAYS).filter((day) => day.meals > 0 && !day.partial);
  if (full.length < 3) return [{ tone: 'neutral', text: t.notEnough }];
  const grams = (value: number) => `${f.number(value)} g`;
  const out: Feedback[] = [];

  const lowProtein = full.filter((day) => day.protein_g < ranges.protein_g[0]);
  if (lowProtein.length >= Math.max(2, Math.ceil(full.length / 2))) out.push({ tone: 'concern', text: t.proteinLow(lowProtein.length, full.length, grams(ranges.protein_g[0])) });

  const hardLow = full.filter((day) => day.day_type === 'hard' && day.carbs_g < ranges.carbs_g.hard[0]);
  if (hardLow.length >= 2) out.push({ tone: 'concern', text: t.carbsLowHard(hardLow.length) });

  // The day before each long run in the last two weeks, when that day was fully logged.
  const byDate = new Map(past.map((day) => [day.date, day]));
  const longRuns = db
    .prepare("SELECT a.calendar_date AS d FROM activities a JOIN activity_metrics m USING (activity_id) WHERE m.category = 'long' AND a.calendar_date BETWEEN ? AND ? ORDER BY a.calendar_date")
    .all(past[0]?.date ?? '', addDays(past.at(-1)?.date ?? '', 1)) as Row[];
  for (const run of longRuns) {
    const before = byDate.get(addDays(String(run.d), -1));
    if (before && before.meals > 0 && !before.partial && before.carbs_g < ranges.carbs_g.moderate[0]) {
      out.push({ tone: 'concern', text: t.beforeLong(f.dayMonth(String(run.d)), grams(before.carbs_g), grams(ranges.carbs_g.moderate[0])) });
    }
  }

  const gaps = full.filter((day) => day.day_type !== 'rest' && day.burned_kcal !== null && day.burned_kcal - day.kcal >= UNDER_FUELED_KCAL);
  if (gaps.length >= 3) {
    const gap = gaps.reduce((sum, day) => sum + (day.burned_kcal! - day.kcal), 0) / gaps.length;
    out.push({ tone: 'concern', text: t.underFueled(gaps.length, `${f.number(Math.round(gap / 50) * 50)} kcal`) });
  }

  if (!out.length) out.push({ tone: 'good', text: t.good });
  return out;
}

export type { Range };
