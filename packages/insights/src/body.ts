import type { DatabaseSync } from 'node:sqlite';
import { ENGLISH, type I18n } from '@companion/i18n';
import { getFitnessAge } from '@companion/queries';
import { addDays } from './days.ts';
import { dailyRanges, GUIDANCE_SOURCE } from './fuel.ts';
import { percentile } from './stats.ts';

type Row = Record<string, unknown>;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export type BodyReport = ReturnType<typeof getBodyReport>;

/**
 * Weight, body composition, energy and fuelling, in one place. Weight is always the smoothed trend: a single weigh-in
 * moves with water and food by a kilo or more, which says nothing about fat or muscle.
 */
export function getBodyReport(db: DatabaseSync, date: string, i18n: I18n = ENGLISH) {
  const series = (db.prepare('SELECT calendar_date, weight_trend_kg, body_fat_trend_pct FROM daily_metrics WHERE calendar_date BETWEEN ? AND ? ORDER BY calendar_date').all(addDays(date, -180), date) as Row[]).map((r) => ({
    date: String(r.calendar_date),
    trend_kg: n(r.weight_trend_kg),
  }));
  const weighIns = (db.prepare('SELECT calendar_date, weight_kg FROM weigh_ins WHERE calendar_date BETWEEN ? AND ? ORDER BY measured_at').all(addDays(date, -180), date) as Row[]).map((r) => ({
    date: String(r.calendar_date),
    kg: round(Number(r.weight_kg)),
  }));
  const goal = n((db.prepare('SELECT weight_goal_kg FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as Row | undefined)?.weight_goal_kg);

  const trendAt = (day: string) => n((db.prepare('SELECT weight_trend_kg AS w FROM daily_metrics WHERE calendar_date <= ? AND weight_trend_kg IS NOT NULL ORDER BY calendar_date DESC LIMIT 1').get(day) as Row | undefined)?.w);
  const current = trendAt(date);
  const monthAgo = trendAt(addDays(date, -28));
  const weight = current === null ? null : weightStatus(current, monthAgo, goal, date, i18n);

  return {
    date,
    weight,
    weight_series: series.map((p) => ({ ...p, trend_kg: p.trend_kg === null ? null : round(p.trend_kg) })),
    weigh_ins: weighIns,
    composition: composition(db, date, i18n),
    fitness_age: getFitnessAge(db, i18n),
    energy: energyByDayType(db, date, i18n),
    sweat: sweatRates(db, date),
    nutrition: current === null ? null : { weight_kg: round(current), ...dailyRanges(current), source: GUIDANCE_SOURCE },
  };
}

/**
 * Where the trend is heading against the goal, and whether the pace is a healthy one for someone training:
 * losing up to about 0.5–1% of body weight a week protects muscle, recovery and performance; faster costs them.
 */
function weightStatus(current: number, monthAgo: number | null, goal: number | null, date: string, { m, f }: I18n) {
  const t = m.body.assessment;
  const perWeekKg = monthAgo === null ? null : (current - monthAgo) / 4;
  const perWeekPct = perWeekKg === null ? null : (perWeekKg / current) * 100;
  let tone: 'good' | 'neutral' | 'concern' = 'neutral';
  let assessment: string;
  let projected: string | null = null;

  if (perWeekPct === null) {
    assessment = t.notEnough;
  } else if (goal !== null && Math.abs(current - goal) < 0.5) {
    assessment = t.atGoal;
    tone = 'good';
  } else if (perWeekPct <= -1) {
    assessment = t.tooFast(f.weight(Math.abs(perWeekKg!), 2), f.percent(Math.abs(perWeekPct), 1));
    tone = 'concern';
  } else if (Math.abs(perWeekPct) < 0.15) {
    assessment = t.steady;
  } else if (goal !== null && (current - goal) * perWeekKg! < 0) {
    // Moving toward the goal at a safe pace.
    assessment = t.towardGoal(perWeekKg! < 0, f.weight(Math.abs(perWeekKg!), 2), f.percent(Math.abs(perWeekPct), 1));
    tone = 'good';
    const weeks = Math.abs(current - goal) / Math.abs(perWeekKg!);
    if (weeks <= 52) projected = addDays(date, Math.round(weeks * 7));
  } else {
    assessment = t.other(perWeekKg! < 0, f.weight(Math.abs(perWeekKg!), 2), goal !== null);
  }

  return {
    trend_kg: round(current),
    goal_kg: goal,
    to_goal_kg: goal === null ? null : round(current - goal),
    change_4w_kg: monthAgo === null ? null : round(current - monthAgo),
    per_week_pct: perWeekPct === null ? null : round(perWeekPct, 2),
    assessment,
    tone,
    /** At the current pace, when the trend would reach the goal (only for a steady, safe pace within a year). */
    projected_goal_date: projected,
  };
}

/** Body fat and muscle over the last month, from the scale. Losing muscle along with weight is the thing to avoid. */
function composition(db: DatabaseSync, date: string, { m }: I18n) {
  const window = (from: string, to: string) =>
    db.prepare('SELECT AVG(body_fat_pct) AS fat, AVG(muscle_mass_kg) AS muscle, COUNT(*) AS n FROM weigh_ins WHERE calendar_date BETWEEN ? AND ?').get(from, to) as Row;
  const now = window(addDays(date, -13), date);
  const before = window(addDays(date, -41), addDays(date, -28));
  if (!Number(now.n)) return null;
  const muscleChange = before.muscle === null || now.muscle === null ? null : Number(now.muscle) - Number(before.muscle);
  const fatChange = before.fat === null || now.fat === null ? null : Number(now.fat) - Number(before.fat);
  return {
    body_fat_pct: n(now.fat) === null ? null : round(Number(now.fat)),
    body_fat_change_pts: fatChange === null ? null : round(fatChange),
    muscle_kg: n(now.muscle) === null ? null : round(Number(now.muscle)),
    muscle_change_kg: muscleChange === null ? null : round(muscleChange),
    /** Averages of two weeks of weigh-ins, now and a month earlier: single readings of a bioimpedance scale are noisy. */
    note: m.body.compositionNote,
    muscle_loss_flag: muscleChange !== null && muscleChange <= -0.4,
  };
}

/** What a rest day, a training day and a big day cost you, from Garmin's calorie estimates over the last 8 weeks. */
function energyByDayType(db: DatabaseSync, date: string, { m }: I18n) {
  const rows = db
    .prepare(
      `SELECT w.calories_total AS kcal, d.load FROM daily_wellness w JOIN daily_metrics d USING (calendar_date)
       WHERE w.calendar_date BETWEEN ? AND ? AND w.calories_total > 0`,
    )
    .all(addDays(date, -56), addDays(date, -1)) as Row[];
  const group = (test: (load: number) => boolean) => {
    const values = rows.filter((r) => test(Number(r.load))).map((r) => Number(r.kcal));
    return values.length ? { kcal: Math.round(values.reduce((a, b) => a + b, 0) / values.length / 10) * 10, days: values.length } : null;
  };
  return {
    rest: group((load) => load === 0),
    training: group((load) => load > 0 && load < 100),
    big: group((load) => load >= 100),
    note: m.body.energyNote,
  };
}

/** Your sweat rate in ml per hour, from Garmin's fluid-loss estimate on runs of the last six months, overall and by temperature. */
function sweatRates(db: DatabaseSync, date: string) {
  const runs = db
    .prepare(
      `SELECT water_estimated_ml AS ml, duration_s AS s, avg_temp_c AS t FROM activities
       WHERE type_key LIKE '%running%' AND water_estimated_ml > 0 AND duration_s >= 1200 AND calendar_date BETWEEN ? AND ?`,
    )
    .all(addDays(date, -180), date) as Row[];
  const rate = (r: Row) => (Number(r.ml) / Number(r.s)) * 3600;
  const median = (rs: Row[]) => (rs.length >= 3 ? Math.round(percentile(rs.map(rate), 0.5) / 10) * 10 : null);
  return {
    typical_ml_per_hour: median(runs),
    // The watch sits on the wrist and reads several degrees above the air: 25°C on the watch is a warm day.
    warm_ml_per_hour: median(runs.filter((r) => Number(r.t) >= 25)),
    cool_ml_per_hour: median(runs.filter((r) => r.t !== null && Number(r.t) < 20)),
    runs: runs.length,
  };
}
