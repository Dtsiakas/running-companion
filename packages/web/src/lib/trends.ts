import type { TrendMetricName } from '@companion/queries';
import { clock } from './format.ts';
import { f, m } from './i18n.ts';

/**
 * How each trend metric is shown. Keyed by the server's metric names, so adding a metric on the server
 * without describing it here fails the typecheck. Built on demand: names and units follow the current locale.
 *
 * kind 'total': summed per period (bars; the current, unfinished period is drawn lighter).
 * kind 'level': a state at a point in time (a line).
 */
export type TrendGroup = 'training' | 'aerobic' | 'recovery' | 'sleep' | 'life' | 'body';

export interface TrendView {
  label: string;
  group: TrendGroup;
  kind: 'total' | 'level';
  /** Turns the API's raw number into the number the chart plots (pace: m/s → seconds per km or mile; km → miles). */
  toChart?: (raw: number) => number;
  format: (value: number) => string;
  /** Lower is better on the chart (pace): the axis is drawn reversed so "up" is always "better or more". */
  reversed?: boolean;
  /** The chart value is a pace in seconds: changes read as "faster" and "slower". */
  pace?: boolean;
  note: string;
}

const fixed = (digits: number, unit = '') => (value: number) => `${f.number(value, digits)}${unit}`;

export function trendViews(): Record<TrendMetricName, TrendView> {
  const label = m.trends.label;
  const note = m.trends.note;
  const n = m.notes;
  return {
    run_km: { label: label.run_km, group: 'training', kind: 'total', toChart: (km) => f.distanceValue(km)!, format: fixed(0, ` ${f.distanceUnit}`), note: note.run_km },
    runs: { label: label.runs, group: 'training', kind: 'total', format: fixed(0), note: note.runs },
    load: { label: label.load, group: 'training', kind: 'total', format: fixed(0), note: note.load },
    fitness: { label: label.fitness, group: 'training', kind: 'level', format: fixed(1), note: n.form },
    form: { label: label.form, group: 'training', kind: 'level', format: (v) => f.signed(v, 1), note: n.form },
    low_intensity_pct: { label: label.low_intensity_pct, group: 'training', kind: 'level', format: fixed(0, '%'), note: n.intensity },
    pace_at_ref_hr: { label: label.pace_at_ref_hr, group: 'aerobic', kind: 'level', toChart: (mps) => f.paceSeconds(mps)!, format: (s) => `${clock(s)}${f.paceUnit}`, reversed: true, pace: true, note: n.paceAtRefHr },
    easy_efficiency: { label: label.easy_efficiency, group: 'aerobic', kind: 'level', format: fixed(3, ` ${m.trends.perBeat}`), note: n.efficiency },
    decoupling: { label: label.decoupling, group: 'aerobic', kind: 'level', format: fixed(1, '%'), reversed: true, note: n.decoupling },
    hrv: { label: label.hrv, group: 'recovery', kind: 'level', format: fixed(0, ' ms'), note: n.hrv },
    resting_hr: { label: label.resting_hr, group: 'recovery', kind: 'level', format: fixed(1, ' bpm'), note: n.restingHr },
    sleep_h: { label: label.sleep_h, group: 'sleep', kind: 'level', format: f.hoursMinutes, note: note.sleep_h },
    sleep_need_h: { label: label.sleep_need_h, group: 'sleep', kind: 'level', format: f.hoursMinutes, note: note.sleep_need_h },
    sleep_score: { label: label.sleep_score, group: 'sleep', kind: 'level', format: fixed(0), note: n.sleepScore },
    deep_sleep_h: { label: label.deep_sleep_h, group: 'sleep', kind: 'level', format: f.hoursMinutes, note: n.sleepScore },
    rem_sleep_h: { label: label.rem_sleep_h, group: 'sleep', kind: 'level', format: f.hoursMinutes, note: n.sleepScore },
    sleep_stress: { label: label.sleep_stress, group: 'sleep', kind: 'level', format: fixed(0), reversed: true, note: n.stress },
    breathing_rate: { label: label.breathing_rate, group: 'sleep', kind: 'level', format: fixed(1, ` ${m.today.perMinute}`), note: n.breathing },
    spo2: { label: label.spo2, group: 'sleep', kind: 'level', format: fixed(1, '%'), note: n.spo2 },
    stress: { label: label.stress, group: 'life', kind: 'level', format: fixed(0), reversed: true, note: n.stress },
    body_battery_morning: { label: label.body_battery_morning, group: 'life', kind: 'level', format: fixed(0), note: n.bodyBattery },
    steps: { label: label.steps, group: 'life', kind: 'level', format: fixed(0), note: note.steps },
    calories: { label: label.calories, group: 'life', kind: 'level', format: fixed(0, ' kcal'), note: note.calories },
    active_calories: { label: label.active_calories, group: 'life', kind: 'level', format: fixed(0, ' kcal'), note: note.active_calories },
    intensity_minutes: { label: label.intensity_minutes, group: 'life', kind: 'total', format: (v) => f.minutes(v), note: n.intensityMinutes },
    weight_kg: { label: label.weight_kg, group: 'body', kind: 'level', toChart: (kg) => f.weightValue(kg)!, format: fixed(1, ` ${f.weightUnit}`), note: n.weight },
    body_fat_pct: { label: label.body_fat_pct, group: 'body', kind: 'level', format: fixed(1, '%'), note: note.body_fat_pct },
  };
}

export const TREND_GROUPS: TrendGroup[] = ['training', 'aerobic', 'recovery', 'sleep', 'life', 'body'];

export const RANGES = [
  { key: '6m', months: 6, period: 'week' },
  { key: '1y', months: 12, period: 'week' },
  { key: '2y', months: 24, period: 'month' },
  { key: 'all', months: null, period: 'month' },
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];
