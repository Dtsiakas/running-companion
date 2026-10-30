import { transaction, upsert, type Database } from '@companion/db';
import { localToday, type CalendarDate } from '@companion/sync';
import { computeActivityMetrics, type RecordPoint } from './activity.ts';
import { bestEfforts, type DistancePoint } from './best-efforts.ts';
import { classifyRun } from './classify.ts';
import { computeDailyMetrics, type DailyInputs } from './daily.ts';
import { thresholdsFromProfile, type ProfileValues, type Thresholds } from './thresholds.ts';

/**
 * Bump when any per-activity formula changes: rows computed with an older version are recomputed on the next run.
 * Daily metrics are always recomputed in full (a few thousand rows, well under a second).
 */
/** Bump when a formula changes: every activity is recomputed on the next run. 2: best efforts on timer time. */
export const METRICS_VERSION = 2;


export interface ComputeOptions {
  /** Recompute every activity, not just new or outdated ones. */
  full?: boolean;
  today?: CalendarDate;
  log?: (message: string) => void;
}

export interface ComputeSummary {
  activities: number;
  days: number;
  thresholds: Thresholds;
}

export function computeMetrics(db: Database, options: ComputeOptions = {}): ComputeSummary {
  const log = options.log ?? (() => {});
  const thresholds = thresholdsFromProfile(
    db.prepare('SELECT max_hr, resting_hr_used, lactate_threshold_hr FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as
      | ProfileValues
      | undefined,
  );

  const activities = computeActivities(db, thresholds, options.full ?? false, log);
  const days = computeDays(db, options.today ?? localToday());
  return { activities, days, thresholds };
}

// Activities ---------------------------------------------------------------------------------------------

interface ActivityRow {
  activity_id: number;
  type_key: string;
  workout_name: string | null;
  te_label: string | null;
  duration_s: number | null;
  calendar_date: string;
  resting_hr: number | null;
}

function computeActivities(db: Database, thresholds: Thresholds, full: boolean, log: (message: string) => void): number {
  const pending = db
    .prepare(
      `SELECT a.activity_id, a.type_key, a.workout_name, a.te_label, a.duration_s, a.calendar_date, w.resting_hr
       FROM activities a
       LEFT JOIN activity_metrics m USING (activity_id)
       LEFT JOIN daily_wellness w ON w.calendar_date = a.calendar_date
       WHERE a.details_synced = 1 AND (? OR m.activity_id IS NULL OR m.metrics_version < ?)
       ORDER BY a.start_time`,
    )
    .all(full ? 1 : 0, METRICS_VERSION) as unknown as ActivityRow[];

  if (pending.length) log(`  activity metrics: ${pending.length} to compute`);
  const readRecords = db.prepare('SELECT time, hr, speed_mps, power_w, distance_m FROM activity_records WHERE activity_id = ? ORDER BY time');

  for (const activity of pending) {
    const rows = readRecords.all(activity.activity_id) as Array<{ time: number; hr: number | null; speed_mps: number | null; power_w: number | null; distance_m: number | null }>;
    const records: RecordPoint[] = rows.map((row) => ({ time: row.time, hr: row.hr, speedMps: row.speed_mps, powerW: row.power_w }));

    const { category, source } = classifyRun({
      typeKey: activity.type_key,
      workoutName: activity.workout_name,
      teLabel: activity.te_label,
      durationS: activity.duration_s,
    });
    const isTreadmill = activity.type_key.includes('treadmill');
    const metrics = computeActivityMetrics(records, category, thresholds, activity.resting_hr ?? thresholds.restingHr);

    // Treadmill distance comes from a wrist accelerometer, not GPS: fine for volume, not for best efforts.
    const efforts = category === 'other' || isTreadmill ? new Map<number, number>() : bestEfforts(toDistancePoints(rows));

    transaction(db, () => {
      upsert(db, 'activity_metrics', ['activity_id'], {
        activity_id: activity.activity_id,
        metrics_version: METRICS_VERSION,
        category,
        category_source: source,
        is_treadmill: isTreadmill,
        trimp: metrics.trimp,
        low_s: metrics.lowS,
        moderate_s: metrics.moderateS,
        high_s: metrics.highS,
        steady_s: metrics.steadyS,
        m_per_beat: metrics.mPerBeat,
        w_per_beat: metrics.wPerBeat,
        decoupling_pct: metrics.decouplingPct,
        ref_hr: thresholds.refHr,
        speed_at_ref_hr_mps: metrics.speedAtRefHrMps,
        ref_hr_s: metrics.refHrS,
        computed_at: Date.now(),
      });
      db.prepare('DELETE FROM activity_best_efforts WHERE activity_id = ?').run(activity.activity_id);
      for (const [distance, seconds] of efforts) {
        upsert(db, 'activity_best_efforts', ['activity_id', 'distance_m'], { activity_id: activity.activity_id, distance_m: distance, duration_s: seconds });
      }
    });
  }
  return pending.length;
}

/**
 * The stream for best efforts, on timer time like Garmin's own times and records: a pause doesn't count.
 * While the watch is paused it records nothing, so a pause shows as a gap between samples after which you're still
 * where you stopped. Such a gap doesn't count at all. A gap you moved through (GPS dropping out while you kept
 * running) counts in full, because you were running. Standing still with the watch running counts too, as on Garmin.
 */
export function toDistancePoints(rows: Array<{ time: number; distance_m: number | null }>): DistancePoint[] {
  const points: DistancePoint[] = [];
  let clock = 0;
  let previous: { time: number; d: number } | null = null;
  for (const row of rows) {
    if (row.distance_m === null) continue;
    // Cumulative distance should never decrease; skip samples where the device corrected it backwards.
    if (previous && row.distance_m < previous.d) continue;
    if (previous) {
      const gap = (row.time - previous.time) / 1000;
      const moved = row.distance_m - previous.d;
      const paused = gap > PAUSE_GAP_S && moved / gap < PAUSE_SPEED_MPS;
      clock += paused ? 0 : gap;
    }
    points.push({ t: clock, d: row.distance_m });
    previous = { time: row.time, d: row.distance_m };
  }
  return points;
}

/** Samples come every second; a silence of 3 seconds or more with almost no distance covered is the watch being paused. */
const PAUSE_GAP_S = 2;
const PAUSE_SPEED_MPS = 0.5;

// Days ---------------------------------------------------------------------------------------------------

function computeDays(db: Database, today: CalendarDate): number {
  const first = db
    .prepare(
      `SELECT MIN(d) AS first FROM (
         SELECT MIN(calendar_date) AS d FROM activities UNION ALL SELECT MIN(calendar_date) FROM daily_wellness
         UNION ALL SELECT MIN(calendar_date) FROM sleep UNION ALL SELECT MIN(calendar_date) FROM weigh_ins)`,
    )
    .get()?.first as string | null;
  if (!first) return 0;

  const toMap = (sql: string) => {
    const map = new Map<CalendarDate, number>();
    for (const row of db.prepare(sql).all()) if (row.value !== null) map.set(row.date as string, Number(row.value));
    return map;
  };

  const inputs: DailyInputs = {
    from: first,
    to: today,
    load: toMap(`SELECT a.calendar_date AS date, SUM(m.trimp) AS value FROM activities a JOIN activity_metrics m USING (activity_id) GROUP BY 1`),
    garminLoad: toMap(`SELECT calendar_date AS date, SUM(training_load) AS value FROM activities GROUP BY 1`),
    runKm: toMap(`SELECT calendar_date AS date, SUM(distance_m) / 1000.0 AS value FROM activities WHERE type_key LIKE '%running%' GROUP BY 1`),
    hrvMs: toMap(`SELECT calendar_date AS date, last_night_avg_ms AS value FROM hrv`),
    rhr: toMap(`SELECT calendar_date AS date, resting_hr AS value FROM daily_wellness`),
    sleep: new Map(
      db
        .prepare('SELECT calendar_date, sleep_s, need_actual_min FROM sleep WHERE sleep_s > 0')
        .all()
        .map((row) => [
          row.calendar_date as string,
          { sleepH: Number(row.sleep_s) / 3600, needH: row.need_actual_min === null ? null : Number(row.need_actual_min) / 60 },
        ]),
    ),
    weightKg: toMap(`SELECT calendar_date AS date, AVG(weight_kg) AS value FROM weigh_ins GROUP BY 1`),
    bodyFatPct: toMap(`SELECT calendar_date AS date, AVG(body_fat_pct) AS value FROM weigh_ins WHERE body_fat_pct IS NOT NULL GROUP BY 1`),
  };

  const rows = computeDailyMetrics(inputs);
  const now = Date.now();
  transaction(db, () => {
    db.exec('DELETE FROM daily_metrics');
    for (const day of rows) {
      upsert(db, 'daily_metrics', ['calendar_date'], {
        calendar_date: day.date,
        load: day.load,
        garmin_load: day.garminLoad,
        fitness: day.fitness,
        fatigue: day.fatigue,
        form: day.form,
        acwr: day.acwr,
        run_km_7d: day.runKm7d,
        run_km_28d: day.runKm28d,
        hrv_ms: day.hrvMs,
        hrv_7d_ms: day.hrv7dMs,
        hrv_baseline_ms: day.hrvBaselineMs,
        hrv_z: day.hrvZ,
        rhr: day.rhr,
        rhr_3d: day.rhr3d,
        rhr_baseline: day.rhrBaseline,
        rhr_z: day.rhrZ,
        sleep_h: day.sleepH,
        sleep_need_h: day.sleepNeedH,
        sleep_debt_7d_h: day.sleepDebt7dH,
        weight_trend_kg: day.weightTrendKg,
        body_fat_trend_pct: day.bodyFatTrendPct,
        status: day.status,
        status_reasons: day.reasons.length ? JSON.stringify(day.reasons) : null,
        computed_at: now,
      });
    }
  });
  return rows.length;
}
