import { addDays, type CalendarDate } from '@companion/sync';

export interface DailyInputs {
  from: CalendarDate;
  to: CalendarDate;
  load: Map<CalendarDate, number>;
  garminLoad: Map<CalendarDate, number>;
  runKm: Map<CalendarDate, number>;
  hrvMs: Map<CalendarDate, number>;
  rhr: Map<CalendarDate, number>;
  sleep: Map<CalendarDate, { sleepH: number; needH: number | null }>;
  weightKg: Map<CalendarDate, number>;
  bodyFatPct: Map<CalendarDate, number>;
}

export interface StatusReason {
  code: 'hrv_low' | 'rhr_high' | 'short_sleep' | 'load_spike' | 'deep_fatigue';
  /** In English, for anything reading the database directly. The app writes it again from `values`, in the reader's language. */
  message: string;
  /** The measured value and the normal it was compared with. */
  values: { value: number; normal?: number };
}

export interface DailyMetrics {
  date: CalendarDate;
  load: number;
  garminLoad: number | null;
  fitness: number;
  fatigue: number;
  form: number;
  acwr: number | null;
  runKm7d: number;
  runKm28d: number;
  hrvMs: number | null;
  hrv7dMs: number | null;
  hrvBaselineMs: number | null;
  hrvZ: number | null;
  rhr: number | null;
  rhr3d: number | null;
  rhrBaseline: number | null;
  rhrZ: number | null;
  sleepH: number | null;
  /** Your own recent normal: average of the previous 28 nights. */
  sleepBaselineH: number | null;
  sleepNeedH: number | null;
  sleepDebt7dH: number | null;
  weightTrendKg: number | null;
  bodyFatTrendPct: number | null;
  status: 'green' | 'amber' | 'red' | null;
  reasons: StatusReason[];
}

// Fitness/fatigue time constants (Banister's impulse-response model, as popularised by TrainingPeaks as CTL/ATL).
const FITNESS_DAYS = 42;
const FATIGUE_DAYS = 7;
const BASELINE_DAYS = 60;
const MIN_BASELINE_SAMPLES = 20;
/** Body weight smoothing: each day moves the trend 10% towards the scale (The Hacker's Diet method). */
const WEIGHT_SMOOTHING = 0.1;

// Status rules. Each one is a common, conservative rule of thumb; see the README for sources and limits.
const HRV_Z_LOW = -1; // 7-day HRV more than 1 SD below your 60-day normal
const RHR_Z_HIGH = 1.5; // 3-day resting HR 1.5 SD above normal…
const RHR_MIN_RISE = 2; // …and at least 2 bpm, so a tiny SD can't trigger it
// Sleep is judged against your own recent normal, like HRV and resting HR. A chronic gap to Garmin's sleep need
// is a trend (sleep_debt_7d_h, weekly view), not a daily alarm: a status that is amber every day says nothing.
const SLEEP_BASELINE_NIGHTS = 28;
const SHORT_SLEEP_DROP_H = 1; // slept at least 1 h less than your recent normal
const ACWR_SPIKE = 1.5; // this week's load 50% above the 4-week average
const FORM_DEEP_FATIGUE = -30;

export function computeDailyMetrics(inputs: DailyInputs): DailyMetrics[] {
  const rows: DailyMetrics[] = [];
  let fitness = 0;
  let fatigue = 0;
  let weightTrend: number | null = null;
  let bodyFatTrend: number | null = null;

  for (let date = inputs.from; date <= inputs.to; date = addDays(date, 1)) {
    const load = inputs.load.get(date) ?? 0;
    // Form uses yesterday's values: how fresh you are going into today, before today's session.
    const form = fitness - fatigue;
    fitness += (load - fitness) / FITNESS_DAYS;
    fatigue += (load - fatigue) / FATIGUE_DAYS;

    const load7 = sumWindow(inputs.load, date, 7);
    const load28 = sumWindow(inputs.load, date, 28);

    // HRV is log-normally distributed, so averages and deviations are taken on ln(HRV).
    const hrvRecent = valuesInWindow(inputs.hrvMs, date, 7).map(Math.log);
    const hrvHistory = valuesInWindow(inputs.hrvMs, addDays(date, -1), BASELINE_DAYS).map(Math.log);
    const hrv7d = hrvRecent.length >= 3 ? mean(hrvRecent) : null;
    const hrvBase = hrvHistory.length >= MIN_BASELINE_SAMPLES ? meanAndSd(hrvHistory) : null;

    const rhrRecent = valuesInWindow(inputs.rhr, date, 3);
    const rhrHistory = valuesInWindow(inputs.rhr, addDays(date, -1), BASELINE_DAYS);
    const rhr3d = rhrRecent.length >= 2 ? mean(rhrRecent) : null;
    const rhrBase = rhrHistory.length >= MIN_BASELINE_SAMPLES ? meanAndSd(rhrHistory) : null;

    const lastNight = inputs.sleep.get(date);
    const previousNights: number[] = [];
    for (let i = 1; i <= SLEEP_BASELINE_NIGHTS; i++) {
      const night = inputs.sleep.get(addDays(date, -i));
      if (night) previousNights.push(night.sleepH);
    }
    let sleepDebt: number | null = null;
    for (let i = 0; i < 7; i++) {
      const night = inputs.sleep.get(addDays(date, -i));
      if (night?.needH) sleepDebt = (sleepDebt ?? 0) + Math.max(0, night.needH - night.sleepH);
    }

    const weight = inputs.weightKg.get(date);
    if (weight !== undefined) weightTrend = weightTrend === null ? weight : weightTrend + (weight - weightTrend) * WEIGHT_SMOOTHING;
    const bodyFat = inputs.bodyFatPct.get(date);
    if (bodyFat !== undefined) bodyFatTrend = bodyFatTrend === null ? bodyFat : bodyFatTrend + (bodyFat - bodyFatTrend) * WEIGHT_SMOOTHING;

    const row: DailyMetrics = {
      date,
      load,
      garminLoad: inputs.garminLoad.get(date) ?? null,
      fitness,
      fatigue,
      form,
      acwr: load28 > 0 ? load7 / (load28 / 4) : null,
      runKm7d: sumWindow(inputs.runKm, date, 7),
      runKm28d: sumWindow(inputs.runKm, date, 28),
      hrvMs: inputs.hrvMs.get(date) ?? null,
      hrv7dMs: hrv7d === null ? null : Math.exp(hrv7d),
      hrvBaselineMs: hrvBase ? Math.exp(hrvBase.mean) : null,
      hrvZ: hrv7d !== null && hrvBase && hrvBase.sd > 0 ? (hrv7d - hrvBase.mean) / hrvBase.sd : null,
      rhr: inputs.rhr.get(date) ?? null,
      rhr3d,
      rhrBaseline: rhrBase?.mean ?? null,
      rhrZ: rhr3d !== null && rhrBase && rhrBase.sd > 0 ? (rhr3d - rhrBase.mean) / rhrBase.sd : null,
      sleepH: lastNight?.sleepH ?? null,
      sleepBaselineH: previousNights.length >= 7 ? mean(previousNights) : null,
      sleepNeedH: lastNight?.needH ?? null,
      sleepDebt7dH: sleepDebt,
      weightTrendKg: weightTrend,
      bodyFatTrendPct: bodyFatTrend,
      status: null,
      reasons: [],
    };
    Object.assign(row, assessStatus(row));
    rows.push(row);
  }
  return rows;
}

/** Rules grouped by the system they describe: two rules about sleep are one signal, not two. */
const DIMENSION: Record<StatusReason['code'], 'hrv' | 'rhr' | 'sleep' | 'load'> = {
  hrv_low: 'hrv',
  rhr_high: 'rhr',
  short_sleep: 'sleep',
  load_spike: 'load',
  deep_fatigue: 'load',
};

/**
 * Green / amber / red from transparent rules; every triggered rule is listed as a reason.
 * The colour counts *dimensions* (HRV, resting HR, sleep, load), not rules:
 * 0 → green, 1 → amber, 2+ → red. Red needs two independent systems to agree, which keeps it rare enough to mean something.
 * Without recovery data (HRV, resting HR or sleep) there is no status.
 * This complements Garmin's training readiness; it does not replace it.
 */
export function assessStatus(day: DailyMetrics): Pick<DailyMetrics, 'status' | 'reasons'> {
  if (day.hrvZ === null && day.rhrZ === null && day.sleepH === null) return { status: null, reasons: [] };

  const reasons: StatusReason[] = [];
  if (day.hrvZ !== null && day.hrvZ < HRV_Z_LOW) {
    reasons.push({ code: 'hrv_low', message: `7-day HRV ${round(day.hrv7dMs)} ms is below your normal ${round(day.hrvBaselineMs)} ms`, values: { value: day.hrv7dMs ?? 0, normal: day.hrvBaselineMs ?? 0 } });
  }
  if (day.rhrZ !== null && day.rhr3d !== null && day.rhrBaseline !== null && day.rhrZ > RHR_Z_HIGH && day.rhr3d - day.rhrBaseline >= RHR_MIN_RISE) {
    reasons.push({ code: 'rhr_high', message: `Resting HR ${round(day.rhr3d)} bpm is above your normal ${round(day.rhrBaseline)} bpm`, values: { value: day.rhr3d, normal: day.rhrBaseline } });
  }
  if (day.sleepH !== null && day.sleepBaselineH !== null && day.sleepH <= day.sleepBaselineH - SHORT_SLEEP_DROP_H) {
    reasons.push({ code: 'short_sleep', message: `Slept ${day.sleepH.toFixed(1)} h, well under your usual ${day.sleepBaselineH.toFixed(1)} h`, values: { value: day.sleepH, normal: day.sleepBaselineH } });
  }
  if (day.acwr !== null && day.acwr > ACWR_SPIKE && day.fitness > 10) {
    reasons.push({ code: 'load_spike', message: `This week's load is ${day.acwr.toFixed(1)}× your 4-week average`, values: { value: day.acwr } });
  }
  if (day.form < FORM_DEEP_FATIGUE) {
    reasons.push({ code: 'deep_fatigue', message: `Form is ${round(day.form)}: fatigue is well above fitness`, values: { value: day.form } });
  }

  const dimensions = new Set(reasons.map((reason) => DIMENSION[reason.code])).size;
  return { status: dimensions === 0 ? 'green' : dimensions === 1 ? 'amber' : 'red', reasons };
}

function valuesInWindow(map: Map<CalendarDate, number>, end: CalendarDate, days: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < days; i++) {
    const value = map.get(addDays(end, -i));
    if (value !== undefined) values.push(value);
  }
  return values;
}

function sumWindow(map: Map<CalendarDate, number>, end: CalendarDate, days: number): number {
  return valuesInWindow(map, end, days).reduce((total, value) => total + value, 0);
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function meanAndSd(values: number[]): { mean: number; sd: number } {
  const m = mean(values);
  const variance = values.reduce((total, value) => total + (value - m) ** 2, 0) / (values.length - 1);
  return { mean: m, sd: Math.sqrt(variance) };
}

function round(value: number | null): string {
  return value === null ? '?' : String(Math.round(value));
}
