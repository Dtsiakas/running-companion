import { STEADY_CATEGORIES, type Category } from './classify.ts';
import type { Thresholds } from './thresholds.ts';

export interface RecordPoint {
  /** UTC milliseconds. */
  time: number;
  hr: number | null;
  speedMps: number | null;
  powerW: number | null;
}

export interface ActivityMetrics {
  trimp: number | null;
  lowS: number;
  moderateS: number;
  highS: number;
  steadyS: number;
  mPerBeat: number | null;
  wPerBeat: number | null;
  decouplingPct: number | null;
  speedAtRefHrMps: number | null;
  refHrS: number;
}

/** Skip the first minutes: HR lags behind effort at the start, which would flatter efficiency. */
const WARMUP_S = 10 * 60;
/** Below this speed you're walking or standing, which says nothing about running efficiency. */
const MIN_RUNNING_SPEED_MPS = 1.5;
/** Gaps longer than this (pauses, smart recording) are capped, so a paused watch doesn't add load. */
const MAX_SAMPLE_GAP_S = 5;
/** Decoupling needs a long steady effort to mean anything. */
const MIN_DECOUPLING_S = 30 * 60;
const REF_HR_WINDOW = 3;
const MIN_REF_HR_S = 120;

/**
 * Per-run metrics from the per-second stream.
 *
 * TRIMP (Banister, 1991), the male weighting:
 *   for each second: minutes × HRr × 0.64 × e^(1.92 × HRr), where HRr = (HR − rest) / (max − rest).
 *   The exponential weighting makes a minute near max HR count far more than an easy minute,
 *   which matches how fatigue actually builds. 60 minutes at threshold ≈ 150–180; an easy 40 minutes ≈ 60–80.
 *
 * Intensity split, three zones around the two lactate thresholds (the model behind "80/20" training):
 *   low < LT1 ≤ moderate < LTHR ≤ high.
 *
 * Efficiency factor = average speed ÷ average HR over the steady part, expressed as metres per heartbeat.
 *   Higher means more distance for the same cardiac work: it rises as aerobic fitness improves.
 *
 * Aerobic decoupling = how much efficiency drops from the first half of the steady part to the second.
 *   Under ~5% on a long easy run indicates good aerobic endurance; above ~10%, HR drifts a lot.
 */
export function computeActivityMetrics(
  records: RecordPoint[],
  category: Category,
  thresholds: Thresholds,
  restingHr: number,
): ActivityMetrics {
  const result: ActivityMetrics = {
    trimp: null,
    lowS: 0,
    moderateS: 0,
    highS: 0,
    steadyS: 0,
    mPerBeat: null,
    wPerBeat: null,
    decouplingPct: null,
    speedAtRefHrMps: null,
    refHrS: 0,
  };
  if (records.length < 2) return result;

  const hrRange = thresholds.maxHr - restingHr;
  const startTime = records[0]!.time;
  const steady: Array<{ dt: number; hr: number; speed: number; power: number | null }> = [];
  let trimp = 0;
  let hasHr = false;

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const next = records[i + 1];
    const dt = next ? Math.min((next.time - record.time) / 1000, MAX_SAMPLE_GAP_S) : 1;
    if (dt <= 0 || record.hr === null || record.hr <= 0) continue;
    hasHr = true;

    const hrReserve = Math.min(Math.max((record.hr - restingHr) / hrRange, 0), 1);
    trimp += (dt / 60) * hrReserve * 0.64 * Math.exp(1.92 * hrReserve);

    if (record.hr < thresholds.lt1Hr) result.lowS += dt;
    else if (record.hr < thresholds.lthr) result.moderateS += dt;
    else result.highS += dt;

    const elapsed = (record.time - startTime) / 1000;
    if (elapsed >= WARMUP_S && record.speedMps !== null && record.speedMps >= MIN_RUNNING_SPEED_MPS && record.hr >= 80) {
      steady.push({ dt, hr: record.hr, speed: record.speedMps, power: record.powerW });
    }
  }

  if (hasHr) result.trimp = trimp;
  if (steady.length === 0) return result;

  result.steadyS = sum(steady, (s) => s.dt);
  result.mPerBeat = efficiency(steady);
  const withPower = steady.filter((s) => s.power !== null && s.power > 0);
  if (withPower.length > steady.length / 2) {
    result.wPerBeat = sum(withPower, (s) => s.power! * s.dt) / sum(withPower, (s) => s.hr * s.dt);
  }

  if (STEADY_CATEGORIES.has(category) && result.steadyS >= MIN_DECOUPLING_S) {
    const half = result.steadyS / 2;
    let elapsed = 0;
    const splitIndex = steady.findIndex((s) => (elapsed += s.dt) >= half);
    const first = efficiency(steady.slice(0, splitIndex + 1));
    const second = efficiency(steady.slice(splitIndex + 1));
    if (first && second) result.decouplingPct = ((first - second) / first) * 100;
  }

  const atRef = steady.filter((s) => Math.abs(s.hr - thresholds.refHr) <= REF_HR_WINDOW);
  result.refHrS = sum(atRef, (s) => s.dt);
  if (result.refHrS >= MIN_REF_HR_S) result.speedAtRefHrMps = median(atRef.map((s) => s.speed));

  return result;
}

/** Time-weighted speed (m/min) ÷ time-weighted HR (beats/min) = metres per beat. */
function efficiency(samples: Array<{ dt: number; hr: number; speed: number }>): number | null {
  const time = sum(samples, (s) => s.dt);
  if (time === 0) return null;
  const speed = sum(samples, (s) => s.speed * s.dt) / time;
  const hr = sum(samples, (s) => s.hr * s.dt) / time;
  return (speed * 60) / hr;
}

function sum<T>(items: T[], value: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += value(item);
  return total;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
