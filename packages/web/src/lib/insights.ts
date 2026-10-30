import { f, m } from './i18n.ts';

/**
 * Plain-language interpretation of the numbers, by explicit rules. Same thresholds as the metrics engine,
 * so a sentence here never disagrees with the status it explains. Garmin stays the primary coach:
 * these lines describe your state; they don't replace Garmin's daily suggestion.
 */

export type Status = 'green' | 'amber' | 'red';

/** The status headline and label; the green detail comes from greenDetail. */
export const statusText = (status: Status | null) => m.insight.status[status ?? 'none'];

/**
 * The green detail names only what was measured: a watch without HRV, or a night without the watch, mustn't read as
 * "HRV and sleep are fine".
 */
export function greenDetail(measured: { hrv: boolean; restingHr: boolean; sleep: boolean }): string {
  const names = m.insight.measured;
  const parts = [measured.hrv && names.hrv, measured.restingHr && names.restingHr, measured.sleep && names.sleep, names.load].filter(Boolean) as string[];
  return m.insight.greenDetail(f.list(parts), parts.length);
}

/** True when a stream has data from the last `days` days: older means the watch isn't recording it (any more). */
export function recentlyRecorded(lastDate: string | null, today: string, days = 30): boolean {
  if (!lastDate) return false;
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000 <= days;
}

export function percentDifference(value: number | null | undefined, reference: number | null | undefined): number | null {
  if (value === null || value === undefined || !reference) return null;
  return Math.round(((value - reference) / reference) * 100);
}

/** Differences smaller than this are measurement noise, not a signal worth a sentence. */
const NOISE: Record<string, number> = { bpm: 1, h: 0.25 };

/** A number with a real minus sign (U+2212), which lines up with "+" and reads better than a hyphen. */
export const signed = (value: number | null | undefined, digits = 1) => f.signed(value, digits);

/** "9% above your normal", "3 bpm below your normal", "40 min below your normal" */
export function relativeToNormal(value: number | null | undefined, normal: number | null | undefined, unit: '' | 'bpm' | 'h' | 'points' | 'breaths' = '', noise?: number): string {
  const r = m.insight.relative;
  if (value === null || value === undefined || normal === null || normal === undefined) return r.noNormal;
  const diff = value - normal;
  const say = (amount: string) => (diff > 0 ? r.above(amount) : r.below(amount));
  if (unit) {
    if (Math.abs(diff) < (noise ?? NOISE[unit] ?? 0.5)) return r.atNormal;
    const a = m.insight.amount;
    if (unit === 'h') return say(a.minutes(Math.round(Math.abs(diff) * 60)));
    if (unit === 'points') return say(a.points(Math.round(Math.abs(diff))));
    if (unit === 'bpm') return say(a.bpm(f.number(Math.abs(diff), 1)));
    return say(a.breaths(f.number(Math.abs(diff), 1)));
  }
  const pct = percentDifference(value, normal)!;
  if (Math.abs(pct) < 3) return r.atNormal;
  return say(`${Math.abs(pct)}%`);
}

/** Form (TSB): fitness minus fatigue. Bands as in the data guide. */
export function describeForm(form: number | null | undefined): string {
  if (form === null || form === undefined) return '';
  const t = m.insight.form;
  return form > 5 ? t.fresh : form >= -10 ? t.balanced : form >= -30 ? t.productive : t.deep;
}

/** Acute:chronic workload ratio. */
export function describeAcwr(acwr: number | null | undefined): string {
  if (acwr === null || acwr === undefined) return '';
  const t = m.insight.acwr;
  return acwr < 0.8 ? t.light : acwr <= 1.3 ? t.steady : acwr <= 1.5 ? t.building : t.spike;
}

