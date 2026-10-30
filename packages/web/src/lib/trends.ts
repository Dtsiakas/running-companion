import type { TrendMetricName } from '@companion/queries';
import { hoursMinutes } from './dates.ts';
import { clock } from './format.ts';
import { m } from './i18n.ts';

/**
 * How each trend metric is shown. Keyed by the server's metric names, so adding a metric on the server
 * without describing it here fails the typecheck.
 *
 * kind 'total': summed per period (bars; the current, unfinished period is drawn lighter).
 * kind 'level': a state at a point in time (a line).
 */
export interface TrendView {
  label: string;
  group: 'Training' | 'Aerobic fitness' | 'Recovery' | 'Sleep' | 'Daily life' | 'Body';
  kind: 'total' | 'level';
  /** Turns the API's raw number into the number the chart plots (pace: m/s → seconds per km). */
  toChart?: (raw: number) => number;
  format: (value: number) => string;
  /** Lower is better on the chart (pace): the axis is drawn reversed so "up" is always "better or more". */
  reversed?: boolean;
  note: string;
}

const fixed = (digits: number, unit = '') => (value: number) => `${value.toFixed(digits)}${unit}`;

export const TREND_VIEWS: Record<TrendMetricName, TrendView> = {
  run_km: { label: 'Distance', group: 'Training', kind: 'total', format: fixed(0, ' km'), note: 'Total running distance per period.' },
  runs: { label: 'Number of runs', group: 'Training', kind: 'total', format: fixed(0), note: 'Runs per period, any type.' },
  load: { label: 'Training load', group: 'Training', kind: 'total', format: fixed(0), note: 'Total TRIMP per period: minutes of running weighted by how hard your heart was working.' },
  fitness: { label: 'Fitness', group: 'Training', kind: 'level', format: fixed(1), note: m.notes.form },
  form: { label: 'Form', group: 'Training', kind: 'level', format: (v) => (v < 0 ? `−${Math.abs(v).toFixed(1)}` : v.toFixed(1)), note: m.notes.form },
  low_intensity_pct: { label: 'Easy share of running time', group: 'Training', kind: 'level', format: fixed(0, '%'), note: m.notes.intensity },
  pace_at_ref_hr: { label: 'Pace at reference heart rate', group: 'Aerobic fitness', kind: 'level', toChart: (mps) => 1000 / mps, format: (s) => `${clock(s)}/km`, reversed: true, note: m.notes.paceAtRefHr },
  easy_efficiency: { label: 'Efficiency on easy runs', group: 'Aerobic fitness', kind: 'level', format: fixed(3, ' m/beat'), note: m.notes.efficiency },
  decoupling: { label: 'Decoupling', group: 'Aerobic fitness', kind: 'level', format: fixed(1, '%'), reversed: true, note: m.notes.decoupling },
  hrv: { label: 'HRV', group: 'Recovery', kind: 'level', format: fixed(0, ' ms'), note: m.notes.hrv },
  resting_hr: { label: 'Resting heart rate', group: 'Recovery', kind: 'level', format: fixed(1, ' bpm'), note: m.notes.restingHr },
  sleep_h: { label: 'Sleep', group: 'Sleep', kind: 'level', format: hoursMinutes, note: 'Average sleep per night.' },
  sleep_need_h: { label: 'Sleep need', group: 'Sleep', kind: 'level', format: hoursMinutes, note: 'The sleep Garmin estimated you needed, averaged per night. It rises after hard training and short nights.' },
  sleep_score: { label: 'Sleep score', group: 'Sleep', kind: 'level', format: fixed(0), note: m.notes.sleepScore },
  deep_sleep_h: { label: 'Deep sleep', group: 'Sleep', kind: 'level', format: hoursMinutes, note: m.notes.sleepScore },
  rem_sleep_h: { label: 'REM sleep', group: 'Sleep', kind: 'level', format: hoursMinutes, note: m.notes.sleepScore },
  sleep_stress: { label: 'Stress during sleep', group: 'Sleep', kind: 'level', format: fixed(0), reversed: true, note: m.notes.stress },
  breathing_rate: { label: 'Breathing rate overnight', group: 'Sleep', kind: 'level', format: fixed(1, ' /min'), note: m.notes.breathing },
  spo2: { label: 'Blood oxygen overnight', group: 'Sleep', kind: 'level', format: fixed(1, '%'), note: m.notes.spo2 },
  stress: { label: 'Stress', group: 'Daily life', kind: 'level', format: fixed(0), reversed: true, note: m.notes.stress },
  body_battery_morning: { label: 'Body Battery in the morning', group: 'Daily life', kind: 'level', format: fixed(0), note: m.notes.bodyBattery },
  steps: { label: 'Steps per day', group: 'Daily life', kind: 'level', format: (v) => Math.round(v).toLocaleString('en-GB'), note: 'Average steps per day, runs included.' },
  calories: { label: 'Calories burned per day', group: 'Daily life', kind: 'level', format: (v) => `${Math.round(v).toLocaleString('en-GB')} kcal`, note: 'Resting plus active calories per day, as Garmin estimates them from your heart rate, movement and profile. Estimates can be 10–20% off, but they are consistent, so changes over time are meaningful.' },
  active_calories: { label: 'Active calories per day', group: 'Daily life', kind: 'level', format: (v) => `${Math.round(v).toLocaleString('en-GB')} kcal`, note: 'Calories burned through movement and exercise, above what your body uses at rest.' },
  intensity_minutes: { label: 'Intensity minutes', group: 'Daily life', kind: 'total', format: fixed(0, ' min'), note: m.notes.intensityMinutes },
  weight_kg: { label: 'Weight', group: 'Body', kind: 'level', format: fixed(1, ' kg'), note: m.notes.weight },
  body_fat_pct: { label: 'Body fat', group: 'Body', kind: 'level', format: fixed(1, '%'), note: 'Smoothed body fat trend from your scale. Bioimpedance scales are noisy day to day; the direction over months is what counts.' },
};

export const TREND_GROUPS = ['Training', 'Aerobic fitness', 'Recovery', 'Sleep', 'Daily life', 'Body'] as const;

export const RANGES = [
  { key: '6m', label: '6 months', months: 6, period: 'week' },
  { key: '1y', label: '1 year', months: 12, period: 'week' },
  { key: '2y', label: '2 years', months: 24, period: 'month' },
  { key: 'all', label: 'All', months: null, period: 'month' },
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];
