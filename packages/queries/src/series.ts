import { ENGLISH, type I18n } from '@companion/i18n';
import type { DatabaseSync } from 'node:sqlite';
import { km, round } from './format.ts';
import { getWeeklySummary, listActivities } from './queries.ts';
import { addDays, mondayOf } from '@companion/dates';

type Row = Record<string, unknown>;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));

// Day-by-day series ------------------------------------------------------------------------------------------

/** One row per day with the values the dashboard charts draw: load model, recovery against baselines, body trend. */
export function getDailySeries(db: DatabaseSync, range: { from: string; to: string }) {
  const rows = db
    .prepare(
      `SELECT calendar_date, load, fitness, fatigue, form, acwr, hrv_ms, hrv_7d_ms, hrv_baseline_ms, hrv_z,
              rhr, rhr_3d, rhr_baseline, rhr_z, sleep_h, sleep_need_h, weight_trend_kg, body_fat_trend_pct, status
       FROM daily_metrics WHERE calendar_date BETWEEN ? AND ? ORDER BY calendar_date`,
    )
    .all(range.from, range.to) as Row[];

  return rows.map((row) => ({
    date: String(row.calendar_date),
    load: round(n(row.load), 0),
    fitness: round(n(row.fitness)),
    fatigue: round(n(row.fatigue)),
    form: round(n(row.form)),
    acwr: round(n(row.acwr), 2),
    hrv_ms: round(n(row.hrv_ms), 0),
    hrv_7d_ms: round(n(row.hrv_7d_ms), 0),
    hrv_baseline_ms: round(n(row.hrv_baseline_ms), 0),
    hrv_z: round(n(row.hrv_z), 2),
    resting_hr: n(row.rhr),
    resting_hr_baseline: round(n(row.rhr_baseline)),
    resting_hr_z: round(n(row.rhr_z), 2),
    sleep_h: round(n(row.sleep_h), 2),
    sleep_need_h: round(n(row.sleep_need_h), 2),
    weight_trend_kg: round(n(row.weight_trend_kg)),
    body_fat_trend_pct: round(n(row.body_fat_trend_pct)),
    status: row.status === null ? null : (String(row.status) as 'green' | 'amber' | 'red'),
  }));
}

/**
 * Normal ranges for the lanes on the Today screen, from the previous 60 days (sleep: 28 nights).
 * HRV is log-normal, so its band is mean ± 1 SD on ln(HRV), converted back to ms (it's asymmetric, as it should be).
 * The bands use the same windows and maths as the recovery status, so the picture and the verdict agree.
 */
export function getBaselineBands(db: DatabaseSync, date: string) {
  const window = db
    .prepare(
      `SELECT d.calendar_date, h.last_night_avg_ms AS hrv, w.resting_hr AS rhr, s.sleep_s / 3600.0 AS sleep_h,
              s.avg_respiration AS breathing, s.avg_spo2_pct AS spo2, s.score AS sleep_score,
              w.body_battery_max AS body_battery, w.stress_avg AS stress
       FROM (SELECT calendar_date FROM daily_metrics WHERE calendar_date < ? ORDER BY calendar_date DESC LIMIT 60) d
       LEFT JOIN hrv h ON h.calendar_date = d.calendar_date
       LEFT JOIN daily_wellness w ON w.calendar_date = d.calendar_date
       LEFT JOIN sleep s ON s.calendar_date = d.calendar_date`,
    )
    .all(date) as Row[];

  const band = (values: number[], transform?: { to: (v: number) => number; from: (v: number) => number }) => {
    if (values.length < 20) return null;
    const xs = transform ? values.map(transform.to) : values;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
    const back = transform?.from ?? ((v: number) => v);
    return { low: round(back(mean - sd), 1)!, typical: round(back(mean), 1)!, high: round(back(mean + sd), 1)! };
  };
  const values = (key: string) => window.map((row) => n(row[key])).filter((v): v is number => v !== null && v > 0);

  return {
    hrv_ms: band(values('hrv'), { to: Math.log, from: Math.exp }),
    resting_hr: band(values('rhr')),
    sleep_h: band(values('sleep_h').slice(0, 28)),
    sleep_score: band(values('sleep_score').slice(0, 28)),
    breathing_rate: band(values('breathing')),
    spo2_pct: band(values('spo2')),
    body_battery_morning: band(values('body_battery')),
    stress_avg: band(values('stress')),
  };
}

// One week -----------------------------------------------------------------------------------------------------

/** Monday of the week containing `date`. */
export const weekStartOf = mondayOf;

/** Everything for the weekly report: the summary row, the week before for comparison, its runs and its days. */
export function getWeek(db: DatabaseSync, weekStart: string, i18n: I18n = ENGLISH) {
  const start = weekStartOf(weekStart);
  const end = addDays(start, 6);
  const previousStart = addDays(start, -7);
  const weeks = getWeeklySummary(db, 260);
  const find = (s: string) => weeks.find((week) => week.week_start === s) ?? null;
  const range = db.prepare('SELECT MIN(calendar_date) AS first, MAX(calendar_date) AS last FROM daily_metrics').get() as Row;

  return {
    week_start: start,
    week_end: end,
    summary: find(start),
    previous: find(previousStart),
    /** Weekly load and km for the 12 weeks up to this one, for the "this week vs recent weeks" chart. */
    recent: weeks.filter((week) => week.week_start! <= start).slice(-12).map((week) => ({ week_start: week.week_start, km: week.km, load: week.load })),
    runs: listActivities(db, { from: start, to: end, limit: 50 }, i18n),
    days: getDailySeries(db, { from: start, to: end }),
    has_previous_week: String(range.first ?? '') <= addDays(start, -1),
    has_next_week: String(range.last ?? '') >= addDays(end, 1),
  };
}

// Per-second records, thinned ------------------------------------------------------------------------------------

/**
 * A run's per-second stream reduced to at most `maxPoints` points for charting: each point averages one time bucket.
 * Averaging (not picking every n-th second) keeps short spikes from dominating and interval structure intact.
 * A one-hour run has 3,600 rows; 400 points are plenty for a phone screen.
 */
export function getActivityRecords(db: DatabaseSync, activityId: number, maxPoints = 400) {
  const rows = db
    .prepare('SELECT time, distance_m, speed_mps, hr, power_w, cadence_spm, altitude_m FROM activity_records WHERE activity_id = ? ORDER BY time')
    .all(activityId) as Row[];
  if (rows.length === 0) return [];

  const start = Number(rows[0]!.time);
  const bucketSize = Math.max(1, Math.ceil(rows.length / maxPoints));
  const points = [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const bucket = rows.slice(i, i + bucketSize);
    const avg = (key: string) => {
      const values = bucket.map((row) => n(row[key])).filter((v): v is number => v !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    const last = bucket.at(-1)!;
    points.push({
      t_s: Math.round((Number(last.time) - start) / 1000),
      distance_km: km(n(last.distance_m)),
      speed_mps: round(avg('speed_mps'), 3),
      hr: round(avg('hr'), 0),
      power_w: round(avg('power_w'), 0),
      cadence_spm: round(avg('cadence_spm'), 0),
      altitude_m: round(avg('altitude_m'), 1),
    });
  }
  return points;
}
