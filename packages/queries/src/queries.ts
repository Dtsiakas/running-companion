import { ENGLISH, type Format, type I18n } from '@companion/i18n';
import type { DatabaseSync } from 'node:sqlite';
import { duration, km, pace, percent, round } from './format.ts';
import { coolEquivalentPace, heatCost } from '@companion/weather/heat';
import { getDay, getFitnessAge } from './wellness.ts';

type Row = Record<string, unknown>;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const s = (value: unknown) => (value === null || value === undefined ? null : String(value));

// Today ------------------------------------------------------------------------------------------------

export function getToday(db: DatabaseSync, date?: string, i18n: I18n = ENGLISH) {
  const day = (date
    ? db.prepare('SELECT * FROM daily_metrics WHERE calendar_date = ?').get(date)
    : db.prepare('SELECT * FROM daily_metrics ORDER BY calendar_date DESC LIMIT 1').get()) as Row | undefined;
  if (!day) return { error: date ? `No data for ${date}.` : 'No metrics yet: run a sync first.' };

  const lastRun = db
    .prepare(
      `SELECT a.activity_id FROM activities a WHERE a.type_key LIKE '%running%' AND a.calendar_date <= ? ORDER BY a.start_time DESC LIMIT 1`,
    )
    .get(String(day.calendar_date)) as Row | undefined;

  return {
    date: String(day.calendar_date),
    status: day.status === null ? null : (String(day.status) as 'green' | 'amber' | 'red'),
    reasons: day.status_reasons ? (JSON.parse(String(day.status_reasons)) as StoredReason[]).map((r) => reasonText(r, i18n)) : [],
    recovery: {
      hrv_last_night_ms: round(n(day.hrv_ms), 0),
      hrv_7d_ms: round(n(day.hrv_7d_ms), 0),
      hrv_normal_ms: round(n(day.hrv_baseline_ms), 0),
      hrv_z: round(n(day.hrv_z), 2),
      resting_hr: n(day.rhr),
      resting_hr_3d: round(n(day.rhr_3d)),
      resting_hr_normal: round(n(day.rhr_baseline)),
      sleep_h: round(n(day.sleep_h), 2),
      sleep_need_h: round(n(day.sleep_need_h), 2),
      sleep_debt_7d_h: round(n(day.sleep_debt_7d_h)),
    },
    training: {
      fitness: round(n(day.fitness)),
      fatigue: round(n(day.fatigue)),
      form: round(n(day.form)),
      acute_chronic_ratio: round(n(day.acwr), 2),
      km_last_7d: round(n(day.run_km_7d)),
      km_last_28d: round(n(day.run_km_28d)),
    },
    // Last night in detail, energy and stress, everyday activity: see getDay for which day each value comes from.
    day: getDay(db, String(day.calendar_date)),
    body: {
      weight_trend_kg: round(n(day.weight_trend_kg)),
      body_fat_trend_pct: round(n(day.body_fat_trend_pct)),
      fitness_age: getFitnessAge(db, i18n),
    },
    last_run: lastRun ? summarizeActivity(db, Number(lastRun.activity_id), i18n.f) : null,
    data_freshness: getFreshness(db),
  };
}

export function getFreshness(db: DatabaseSync) {
  const latest = db
    .prepare(
      `SELECT (SELECT MAX(calendar_date) FROM activities) AS activities, (SELECT MAX(calendar_date) FROM sleep) AS sleep,
              (SELECT MAX(calendar_date) FROM hrv) AS hrv, (SELECT MAX(calendar_date) FROM daily_wellness) AS wellness,
              (SELECT MAX(calendar_date) FROM weigh_ins) AS weigh_ins,
              (SELECT MAX(updated_at) FROM sync_state) AS last_sync`,
    )
    .get() as Row;
  const date = (value: unknown) => (value === null || value === undefined ? null : String(value));
  return {
    activities: date(latest.activities),
    sleep: date(latest.sleep),
    hrv: date(latest.hrv),
    wellness: date(latest.wellness),
    weigh_ins: date(latest.weigh_ins),
    last_sync: latest.last_sync ? new Date(Number(latest.last_sync)).toISOString() : null,
  };
}

// Activities ---------------------------------------------------------------------------------------------

const ACTIVITY_SELECT = `
  SELECT a.*, m.category, m.trimp, m.low_s, m.moderate_s, m.high_s, m.m_per_beat, m.w_per_beat, m.decoupling_pct,
         m.speed_at_ref_hr_mps, m.ref_hr, m.is_treadmill
  FROM activities a LEFT JOIN activity_metrics m USING (activity_id)`;

function activityRow(row: Row, f: Format = ENGLISH.f) {
  const zoneTotal = (n(row.low_s) ?? 0) + (n(row.moderate_s) ?? 0) + (n(row.high_s) ?? 0);
  return {
    activity_id: n(row.activity_id),
    date: s(row.calendar_date),
    start_local: s(row.start_time_local),
    name: s(row.name),
    type: s(row.type_key),
    planned_workout: s(row.workout_name),
    category: s(row.category),
    distance_km: km(n(row.distance_m)),
    duration: duration(n(row.duration_s)),
    pace: pace(n(row.avg_speed_mps), f),
    avg_hr: n(row.avg_hr),
    max_hr: n(row.max_hr),
    avg_power_w: n(row.avg_power_w),
    cadence_spm: round(n(row.avg_cadence_spm), 0),
    load_trimp: round(n(row.trimp), 0),
    garmin_load: round(n(row.training_load), 0),
    garmin_te: s(row.te_label),
    intensity_pct: zoneTotal ? { low: percent(n(row.low_s), zoneTotal), moderate: percent(n(row.moderate_s), zoneTotal), high: percent(n(row.high_s), zoneTotal) } : null,
    m_per_beat: round(n(row.m_per_beat), 3),
    pace_at_ref_hr: pace(n(row.speed_at_ref_hr_mps), f),
    decoupling_pct: round(n(row.decoupling_pct)),
    rpe: n(row.rpe),
    feel: n(row.feel),
    treadmill: n(row.is_treadmill) === 1,
    calories: n(row.calories),
    /** Garmin's estimate of fluid lost (ml). */
    water_estimated_ml: n(row.water_estimated_ml),
    duration_min: round((n(row.duration_s) ?? NaN) / 60, 0),
  };
}

function summarizeActivity(db: DatabaseSync, activityId: number, f: Format) {
  const row = db.prepare(`${ACTIVITY_SELECT} WHERE a.activity_id = ?`).get(activityId) as Row | undefined;
  return row ? activityRow(row, f) : null;
}

export interface ListFilters {
  from?: string;
  to?: string;
  category?: string;
  type?: string;
  limit?: number;
  /** Skip this many of the newest matches: paging for the run list. */
  offset?: number;
}

export function listActivities(db: DatabaseSync, filters: ListFilters, { f }: I18n = ENGLISH) {
  // Each filter is "not set, or matches", so one fixed statement covers every combination.
  const rows = db
    .prepare(
      `${ACTIVITY_SELECT}
       WHERE (:from IS NULL OR a.calendar_date >= :from)
         AND (:to IS NULL OR a.calendar_date <= :to)
         AND (:category IS NULL OR m.category = :category)
         AND (:type IS NULL OR a.type_key LIKE '%' || :type || '%')
       ORDER BY a.start_time DESC
       LIMIT :limit OFFSET :offset`,
    )
    .all({
      from: filters.from ?? null,
      to: filters.to ?? null,
      category: filters.category ?? null,
      type: filters.type ?? null,
      limit: Math.min(filters.limit ?? 20, 200),
      offset: filters.offset ?? 0,
    }) as Row[];
  return rows.map((row) => activityRow(row, f));
}

export function getActivity(db: DatabaseSync, activityId?: number, i18n: I18n = ENGLISH) {
  const { f } = i18n;
  const id =
    activityId ??
    n((db.prepare('SELECT activity_id FROM activities ORDER BY start_time DESC LIMIT 1').get() as Row | undefined)?.activity_id);
  const row = id === null ? undefined : (db.prepare(`${ACTIVITY_SELECT} WHERE a.activity_id = ?`).get(id) as Row | undefined);
  if (!row) return { error: `Activity ${activityId ?? ''} not found.` };

  const laps = (db.prepare('SELECT * FROM activity_laps WHERE activity_id = ? ORDER BY lap_index').all(id) as Row[]).map((lap) => ({
    lap: n(lap.lap_index)! + 1,
    intensity: s(lap.intensity),
    workout_step: n(lap.workout_step_index),
    distance_km: km(n(lap.distance_m)),
    time: duration(n(lap.timer_s)),
    pace: pace(n(lap.avg_speed_mps), f),
    avg_hr: n(lap.avg_hr),
    max_hr: n(lap.max_hr),
    avg_power_w: n(lap.avg_power_w),
    cadence_spm: round(n(lap.avg_cadence_spm), 0),
    gct_ms: round(n(lap.avg_gct_ms), 0),
    step_length_m: round((n(lap.avg_step_length_mm) ?? NaN) / 1000, 2),
  }));

  const efforts = (db.prepare('SELECT distance_m, duration_s FROM activity_best_efforts WHERE activity_id = ? ORDER BY distance_m').all(id) as Row[]).map((e) => ({
    distance: distanceLabel(n(e.distance_m)!, i18n),
    time: duration(n(e.duration_s)),
    pace: pace(n(e.distance_m)! / n(e.duration_s)!, f),
  }));

  return {
    ...activityRow(row, f),
    details: {
      elevation_gain_m: n(row.elevation_gain_m),
      avg_gap_pace: pace(n(row.avg_gap_speed_mps), f),
      norm_power_w: n(row.norm_power_w),
      avg_gct_ms: n(row.avg_gct_ms),
      avg_vertical_oscillation_mm: round(n(row.avg_vertical_oscillation_mm)),
      avg_vertical_ratio_pct: round(n(row.avg_vertical_ratio_pct)),
      avg_step_length_m: round((n(row.avg_step_length_mm) ?? NaN) / 1000, 2),
      temperature_c: round(n(row.avg_temp_c)),
      aerobic_te: round(n(row.aerobic_te)),
      anaerobic_te: round(n(row.anaerobic_te)),
      compliance_score: n(row.compliance_score),
      stamina_start_end_pct: [n(row.stamina_start_pct), n(row.stamina_end_pct)],
      hr_zone_minutes: [1, 2, 3, 4, 5].map((z) => round((n(row[`hr_zone${z}_s`]) ?? 0) / 60)),
      power_zone_minutes: [1, 2, 3, 4, 5].map((z) => round((n(row[`power_zone${z}_s`]) ?? 0) / 60)),
    },
    weather: runWeather(db, id!, n(row.avg_speed_mps), f),
    planned_steps: plannedSteps(db, id!, f),
    executed_steps: executedSteps(db, id!, f),
    laps,
    best_efforts: efforts,
  };
}

/**
 * Air temperature and dew point at the run (Open-Meteo, not the wrist sensor), the heat cost they imply and the pace
 * that effort would have been in cool weather. Null for treadmill runs and runs whose weather isn't synced yet.
 */
function runWeather(db: DatabaseSync, activityId: number, speedMps: number | null, f: Format) {
  const w = db.prepare('SELECT temp_c, dew_point_c, humidity_pct, wind_kmh, source FROM activity_weather WHERE activity_id = ?').get(activityId) as Row | undefined;
  if (!w) return null;
  const heat = heatCost(Number(w.temp_c), Number(w.dew_point_c));
  const secPerKm = speedMps ? 1000 / speedMps : null;
  return {
    temp_c: round(n(w.temp_c)),
    dew_point_c: round(n(w.dew_point_c)),
    humidity_pct: round(n(w.humidity_pct), 0),
    wind_kmh: round(n(w.wind_kmh), 0),
    source: s(w.source),
    heat,
    cool_pace: secPerKm && heat.pct > 0 ? pace(1000 / coolEquivalentPace(secPerKm, heat.pct), f) : null,
  };
}

function rawWorkoutSteps(db: DatabaseSync, activityId: number): Row[] | null {
  const raw = db.prepare(`SELECT body FROM raw_responses WHERE endpoint = 'activity-workouts' AND key = ?`).get(String(activityId)) as Row | undefined;
  const workouts = raw ? (JSON.parse(String(raw.body)) as Array<{ steps?: Row[] }> | null) : null;
  const steps = workouts?.[0]?.steps;
  return Array.isArray(steps) ? steps : null;
}

/**
 * Planned versus actual, one row per step as it was run. The watch auto-laps every kilometre, so one 8-minute interval
 * is often two laps; consecutive laps with the same workout step are merged back into the step. A repeated step
 * (interval, recovery, interval) appears once per repetition. Laps under 10 seconds are the stop-button remainder and are skipped.
 * Pace is total distance over total time; heart rate is time-weighted.
 */
function executedSteps(db: DatabaseSync, activityId: number, f: Format) {
  const planned = rawWorkoutSteps(db, activityId);
  if (!planned) return null;
  const byIndex = new Map(planned.map((step) => [n(step.stepIndex), step]));
  const laps = db
    .prepare('SELECT workout_step_index, intensity, distance_m, timer_s, avg_hr FROM activity_laps WHERE activity_id = ? AND timer_s >= 10 ORDER BY lap_index')
    .all(activityId) as Row[];

  const groups: Array<{ step: number | null; intensity: string | null; distance: number; time: number; hrTime: number; hrWeighted: number }> = [];
  for (const lap of laps) {
    const step = n(lap.workout_step_index);
    const last = groups.at(-1);
    const group = last && last.step === step ? last : groups[groups.push({ step, intensity: s(lap.intensity), distance: 0, time: 0, hrTime: 0, hrWeighted: 0 }) - 1]!;
    const time = n(lap.timer_s) ?? 0;
    group.distance += n(lap.distance_m) ?? 0;
    group.time += time;
    const hr = n(lap.avg_hr);
    if (hr !== null) {
      group.hrTime += time;
      group.hrWeighted += hr * time;
    }
  }

  return groups.map((group) => {
    const plan = group.step === null ? undefined : byIndex.get(group.step);
    const speed = group.time ? group.distance / group.time : null;
    const low = plan && s(plan.targetType) === 'SPEED' ? n(plan.targetValueLow) : null;
    const high = plan && s(plan.targetType) === 'SPEED' ? n(plan.targetValueHigh) : null;
    // Judged in whole seconds per km, the precision you read: Garmin stores target speeds rounded to 3 decimals, so a
    // strict speed comparison would call 4:21/km "fast" against a 4:21/km edge.
    const secondsPerKm = (mps: number) => Math.round(1000 / mps);
    const onTarget =
      speed === null || !low || !high ? null : secondsPerKm(speed) > secondsPerKm(low) ? 'slow' : secondsPerKm(speed) < secondsPerKm(high) ? 'fast' : 'on';
    return {
      step: group.step,
      intensity: group.intensity,
      planned: plan ? stepDuration(plan, f) : null,
      /** Target as pace text, faster end first: "4:21/km – 4:41/km". */
      target_pace: low && high ? `${pace(high, f)} – ${pace(low, f)}` : null,
      target_speed_mps: low && high ? [low, high] : null,
      distance_km: km(group.distance),
      time: duration(group.time),
      pace: pace(speed, f),
      speed_mps: round(speed, 3),
      avg_hr: group.hrTime ? Math.round(group.hrWeighted / group.hrTime) : null,
      on_target: onTarget,
    };
  });
}

function stepDuration(step: Row, f: Format): string | null {
  const type = s(step.durationType);
  return type === 'TIME' ? duration(n(step.durationValue)) : type === 'DISTANCE' ? f.distance((n(step.durationValue) ?? 0) / 1000, 2) : type === 'LAP_BUTTON' ? 'Lap button' : type;
}

/** The structured workout Garmin loaded on the watch, from the stored raw response. */
function plannedSteps(db: DatabaseSync, activityId: number, f: Format) {
  const steps = rawWorkoutSteps(db, activityId);
  if (!steps) return null;
  return steps.map((step) => {
    const isRepeat = s(step.durationType) === 'REPEAT_UNTIL_STEPS_CMPLT';
    const target =
      s(step.targetType) === 'SPEED' && n(step.targetValueLow) && n(step.targetValueHigh)
        ? `${pace(n(step.targetValueHigh), f)} – ${pace(n(step.targetValueLow), f)}`
        : null;
    return {
      step: n(step.stepIndex),
      intensity: s(step.intensity),
      ...(isRepeat
        ? { repeat: `steps from ${n(step.durationValue)} onwards, ${n(step.targetValue)} times in total` }
        : {
            duration: stepDuration(step, f),
            target_pace: target,
          }),
    };
  });
}

/** A best-effort distance's name, in the reader's language ("5 km", "Half marathon"). */
function distanceLabel(metres: number, { m, f }: I18n): string {
  return m.progress.distanceName[String(metres)] ?? (metres >= 1000 ? f.distance(metres / 1000, 2) : `${metres} m`);
}

interface StoredReason {
  code: keyof I18n['m']['status'];
  message: string;
  values?: { value: number; normal?: number };
}

/** A status reason in the reader's language, from its stored numbers (older rows have only the English message). */
function reasonText(reason: StoredReason, { m, f }: I18n): string {
  const write = m.status[reason.code];
  if (!reason.values || !write) return reason.message;
  const { value, normal = 0 } = reason.values;
  switch (reason.code) {
    case 'hrv_low':
      return m.status.hrv_low(f.number(value), f.number(normal));
    case 'rhr_high':
      return m.status.rhr_high(f.number(value, 1), f.number(normal, 1));
    case 'short_sleep':
      return m.status.short_sleep(f.number(value, 1), f.number(normal, 1));
    case 'load_spike':
      return m.status.load_spike(f.number(value, 1));
    case 'deep_fatigue':
      return m.status.deep_fatigue(f.number(value));
  }
}

// Best efforts -----------------------------------------------------------------------------------------

export function getBestEfforts(db: DatabaseSync, since?: string, i18n: I18n = ENGLISH) {
  const { f } = i18n;
  const rows = db
    .prepare(
      `SELECT e.distance_m, e.duration_s, a.calendar_date, a.name, a.activity_id
       FROM activity_best_efforts e JOIN activities a USING (activity_id)
       WHERE (:since IS NULL OR a.calendar_date >= :since)
         AND e.duration_s = (SELECT MIN(e2.duration_s) FROM activity_best_efforts e2 JOIN activities a2 USING (activity_id)
                             WHERE e2.distance_m = e.distance_m AND (:since IS NULL OR a2.calendar_date >= :since))
       ORDER BY e.distance_m`,
    )
    .all({ since: since ?? null }) as Row[];
  return rows.map((row) => ({
    distance: distanceLabel(n(row.distance_m)!, i18n),
    time: duration(n(row.duration_s)),
    pace: pace(n(row.distance_m)! / n(row.duration_s)!, f),
    date: s(row.calendar_date),
    activity: s(row.name),
    activity_id: n(row.activity_id),
  }));
}

// Weeks and trends -----------------------------------------------------------------------------------------

export function getWeeklySummary(db: DatabaseSync, weeks: number, { f }: I18n = ENGLISH) {
  const rows = db.prepare('SELECT * FROM weekly_summary ORDER BY week_start DESC LIMIT ?').all(Math.min(weeks, 260)) as Row[];
  return rows.reverse().map((row) => ({
    week_start: s(row.week_start),
    runs: n(row.runs),
    km: n(row.km),
    hours: n(row.hours),
    longest_km: n(row.longest_km),
    load: n(row.load),
    intensity_pct: row.low_pct === null ? null : { low: n(row.low_pct), moderate: n(row.moderate_pct), high: n(row.high_pct) },
    easy_m_per_beat: n(row.easy_m_per_beat),
    pace_at_ref_hr: pace(n(row.speed_at_ref_hr_mps), f),
    fitness_end: n(row.fitness),
    form_end: n(row.form),
    weight_trend_kg: n(row.weight_trend_kg),
    body_fat_trend_pct: n(row.body_fat_trend_pct),
    avg_sleep_h: n(row.avg_sleep_h),
    avg_hrv_ms: n(row.avg_hrv_ms),
    avg_resting_hr: n(row.avg_rhr),
    red_days: n(row.red_days),
  }));
}

/** Where a trend metric is read from: computed daily metrics, Garmin's daily wellness, nights of sleep, or runs. */
const TREND_SOURCES = {
  daily: 'daily_metrics',
  wellness: 'daily_wellness',
  sleep: 'sleep',
  runs: 'activities a JOIN activity_metrics m USING (activity_id)',
} as const;

interface TrendMetric {
  description: string;
  source: keyof typeof TREND_SOURCES;
  sql: string;
  /** Formats the aggregated value. */
  format?: (value: number | null) => unknown;
}

const STEADY_OUTDOOR = `m.category IN ('easy', 'long', 'recovery') AND m.is_treadmill = 0`;

export const TREND_METRICS = {
  fitness: { description: 'Fitness (CTL) at period end', source: 'daily', sql: 'MAX(calendar_date), fitness' },
  form: { description: 'Average form (TSB)', source: 'daily', sql: 'AVG(form)' },
  load: { description: 'Total training load (TRIMP)', source: 'daily', sql: 'SUM(load)' },
  run_km: { description: 'Running distance (km)', source: 'runs', sql: `SUM(a.distance_m) / 1000.0` },
  runs: { description: 'Number of runs', source: 'runs', sql: 'COUNT(*)' },
  hrv: { description: 'Average nightly HRV (ms)', source: 'daily', sql: 'AVG(hrv_ms)' },
  resting_hr: { description: 'Average resting HR (bpm)', source: 'daily', sql: 'AVG(rhr)' },
  sleep_h: { description: 'Average sleep (hours)', source: 'daily', sql: 'AVG(sleep_h)' },
  sleep_need_h: { description: "Average Garmin sleep need (hours)", source: 'daily', sql: 'AVG(sleep_need_h)' },
  weight_kg: { description: 'Weight trend (kg) at period end', source: 'daily', sql: 'MAX(calendar_date), weight_trend_kg' },
  body_fat_pct: { description: 'Body fat trend (%) at period end', source: 'daily', sql: 'MAX(calendar_date), body_fat_trend_pct' },
  easy_efficiency: { description: 'Metres per heartbeat on easy outdoor runs', source: 'runs', sql: `AVG(CASE WHEN ${STEADY_OUTDOOR} THEN m.m_per_beat END)` },
  pace_at_ref_hr: {
    description: 'Pace at the reference HR on outdoor runs',
    source: 'runs',
    sql: 'AVG(CASE WHEN m.is_treadmill = 0 THEN m.speed_at_ref_hr_mps END)',
    format: pace,
  },
  decoupling: { description: 'Average decoupling (%) on steady runs of 30+ min', source: 'runs', sql: `AVG(CASE WHEN ${STEADY_OUTDOOR} THEN m.decoupling_pct END)` },
  low_intensity_pct: {
    description: 'Share of running time below LT1 (%)',
    source: 'runs',
    sql: '100.0 * SUM(m.low_s) / NULLIF(SUM(m.low_s + m.moderate_s + m.high_s), 0)',
  },
  // Sleep: per night, averaged over the period.
  sleep_score: { description: "Garmin's sleep score (0–100), average per night", source: 'sleep', sql: 'AVG(score)' },
  deep_sleep_h: { description: 'Deep sleep per night (hours)', source: 'sleep', sql: 'AVG(deep_s) / 3600.0' },
  rem_sleep_h: { description: 'REM sleep per night (hours)', source: 'sleep', sql: 'AVG(rem_s) / 3600.0' },
  breathing_rate: { description: 'Overnight breathing rate (breaths per minute)', source: 'sleep', sql: 'AVG(avg_respiration)' },
  spo2: { description: 'Overnight blood oxygen, SpO2 (%)', source: 'sleep', sql: 'AVG(avg_spo2_pct)' },
  sleep_stress: { description: 'Stress during sleep (0–100)', source: 'sleep', sql: 'AVG(avg_sleep_stress)' },
  // Daily life: Garmin's all-day measurements, averaged per day unless noted.
  stress: { description: 'All-day stress (0–100), average per day', source: 'wellness', sql: 'AVG(stress_avg)' },
  body_battery_morning: { description: 'Body Battery peak of the day, usually right after waking (0–100)', source: 'wellness', sql: 'AVG(body_battery_max)' },
  steps: { description: 'Steps per day', source: 'wellness', sql: 'AVG(steps)' },
  calories: { description: 'Calories burned per day (resting + active)', source: 'wellness', sql: 'AVG(calories_total)' },
  active_calories: { description: 'Active calories per day', source: 'wellness', sql: 'AVG(calories_active)' },
  intensity_minutes: {
    description: 'Intensity minutes, total for the period (vigorous count double, as Garmin and the WHO count them)',
    source: 'wellness',
    sql: 'SUM(COALESCE(moderate_intensity_min, 0) + 2 * COALESCE(vigorous_intensity_min, 0))',
  },
} satisfies Record<string, TrendMetric>;

export type TrendMetricName = keyof typeof TREND_METRICS;

export function getTrend(db: DatabaseSync, metricName: string, period: 'week' | 'month', from?: string, to?: string) {
  const metric: TrendMetric | undefined = TREND_METRICS[metricName as TrendMetricName];
  if (!metric) return { error: `Unknown metric. Choose from: ${Object.keys(TREND_METRICS).join(', ')}` };

  const dateColumn = metric.source === 'runs' ? 'a.calendar_date' : 'calendar_date';
  const bucket =
    period === 'month'
      ? `substr(${dateColumn}, 1, 7)`
      : `date(${dateColumn}, '-' || ((CAST(strftime('%w', ${dateColumn}) AS INTEGER) + 6) % 7) || ' days')`;
  const fromClause = TREND_SOURCES[metric.source];
  const filters = [metric.source === 'runs' ? `a.type_key LIKE '%running%'` : '1', `(:from IS NULL OR ${dateColumn} >= :from)`, `(:to IS NULL OR ${dateColumn} <= :to)`];

  // "MAX(calendar_date), col" picks col from the period's last day (SQLite bare-column rule); the value is the last column.
  const rows = db
    .prepare(`SELECT ${bucket} AS period, ${metric.sql} FROM ${fromClause} WHERE ${filters.join(' AND ')} GROUP BY 1 ORDER BY 1`)
    .all({ from: from ?? null, to: to ?? null }) as Row[];

  return {
    metric: metricName,
    description: metric.description,
    period,
    points: rows.map((row) => {
      const values = Object.values(row);
      const value = n(values.at(-1));
      // `value` is what a reader sees (pace as "5:31/km"); `raw` is the number behind it, for charts.
      return { period: s(row.period), value: metric.format ? metric.format(value) : round(value, 2), raw: round(value, 3) };
    }),
  };
}

/**
 * The trend metrics with any data at all. A watch without HRV, a runner without a scale or someone who only runs on a
 * treadmill shouldn't be offered charts that can only ever be empty.
 */
export function getAvailableTrendMetrics(db: DatabaseSync): TrendMetricName[] {
  return (Object.keys(TREND_METRICS) as TrendMetricName[]).filter((name) => {
    const trend = getTrend(db, name, 'month');
    return !!trend.points?.some((p) => p.raw !== null && p.raw !== 0);
  });
}

export { runQuery } from './sql.ts';

export function describeSchema(db: DatabaseSync) {
  const tables = db
    .prepare(`SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`)
    .all() as Row[];
  return Object.fromEntries(
    tables.map((table) => [
      `${table.name}${table.type === 'view' ? ' (view)' : ''}`,
      (db.prepare(`SELECT name, type FROM pragma_table_info(?)`).all(String(table.name)) as Row[]).map((c) => `${c.name} ${c.type || ''}`.trim()).join(', '),
    ]),
  );
}
