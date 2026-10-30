import type { DatabaseSync } from 'node:sqlite';
import { percentile } from './stats.ts';

type Row = Record<string, unknown>;
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const MIN_RUNS = 3;

/**
 * Each form measure, how it's stored per run, and which way is more economical. Cadence and step length are two
 * sides of one coin at a fixed pace (speed = cadence × step length), so they always move opposite ways here.
 */
const MEASURES = {
  cadence: { label: 'Cadence', unit: 'spm', digits: 0, better: 'higher', value: (r: Row) => num(r.avg_cadence_spm) },
  step_length: { label: 'Step length', unit: 'm', digits: 2, better: null, value: (r: Row) => (num(r.avg_step_length_mm) === null ? null : num(r.avg_step_length_mm)! / 1000) },
  gct: { label: 'Ground contact time', unit: 'ms', digits: 0, better: 'lower', value: (r: Row) => num(r.avg_gct_ms) },
  vertical_ratio: { label: 'Vertical ratio', unit: '%', digits: 1, better: 'lower', value: (r: Row) => num(r.avg_vertical_ratio_pct) },
  vertical_oscillation: { label: 'Vertical oscillation', unit: 'cm', digits: 1, better: 'lower', value: (r: Row) => (num(r.avg_vertical_oscillation_mm) === null ? null : num(r.avg_vertical_oscillation_mm)! / 10) },
  // Garmin's running power is modelled from the watch's motion sensors and your weight, and the model has changed with
  // firmware updates, so a step in it says more about the watch than about you: no better/worse verdict.
  power: { label: 'Power', unit: 'W', digits: 0, better: null, value: (r: Row) => num(r.avg_power_w) },
} as const;
export type FormMeasure = keyof typeof MEASURES;

function num(value: unknown): number | null {
  return value === null || value === undefined || Number(value) === 0 ? null : Number(value);
}

/**
 * Running form month by month on easy outdoor runs, every measure adjusted to the same pace so months compare
 * fairly: faster running brings higher cadence, longer steps and shorter contact by itself.
 *
 * How: for each measure, the slope against speed is estimated from the variation inside each month (so fitness
 * changing between months doesn't bias it), then each month's average is moved along that slope to your typical
 * easy speed. Months with fewer than three such runs are left out.
 */
export function getFormTrend(db: DatabaseSync, today: string) {
  const runs = db
    .prepare(
      `SELECT a.calendar_date, a.avg_speed_mps, a.avg_cadence_spm, a.avg_step_length_mm, a.avg_gct_ms, a.avg_vertical_ratio_pct, a.avg_vertical_oscillation_mm, a.avg_power_w
       FROM activities a JOIN activity_metrics m USING (activity_id)
       WHERE m.category IN ('easy', 'long', 'recovery') AND m.is_treadmill = 0 AND a.avg_gct_ms IS NOT NULL AND a.avg_speed_mps > 1.5 AND a.calendar_date <= ?
       ORDER BY a.calendar_date`,
    )
    .all(today) as Row[];
  if (runs.length < MIN_RUNS * 2) return null;

  const refSpeed = percentile(runs.map((r) => Number(r.avg_speed_mps)), 0.5);
  const byMonth = new Map<string, Row[]>();
  for (const r of runs) byMonth.set(String(r.calendar_date).slice(0, 7), [...(byMonth.get(String(r.calendar_date).slice(0, 7)) ?? []), r]);
  const months = [...byMonth.entries()].filter(([, list]) => list.length >= MIN_RUNS);

  const measures = Object.fromEntries(
    (Object.keys(MEASURES) as FormMeasure[]).map((key) => {
      const spec = MEASURES[key];
      const slope = withinMonthSlope(months.map(([, list]) => list), spec.value);
      const values = new Map(
        months.flatMap(([month, list]) => {
          const pairs = list.map((r) => [Number(r.avg_speed_mps), spec.value(r)] as const).filter((p): p is readonly [number, number] => p[1] !== null);
          if (pairs.length < MIN_RUNS) return [];
          const speed = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
          const value = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
          return [[month, { runs: pairs.length, value: round(value + slope * (refSpeed - speed), spec.digits + 1) }] as const];
        }),
      );
      // Every calendar month from the first to the last, so a gap in running (a quiet year) shows as a gap, not a jump.
      const points: FormSeries['points'] = [];
      if (values.size) {
        const keys = [...values.keys()].sort();
        for (let month = keys[0]!; month <= keys.at(-1)!; month = nextMonth(month)) points.push({ month, runs: values.get(month)?.runs ?? 0, value: values.get(month)?.value ?? null });
      }
      // The last three months against the same three a year earlier: the recent direction, with the season cancelled
      // out. Without a year of history, against the first three months instead.
      const lastMonth = points.at(-1)?.month;
      const window = (endMonth: string) => [0, 1, 2].map((i) => shiftMonth(endMonth, -i));
      const avg = (keys: string[]) => {
        const v = keys.map((k) => values.get(k)?.value).filter((x): x is number => x !== undefined);
        return v.length >= 2 ? v.reduce((a, b) => a + b, 0) / v.length : null;
      };
      const last = lastMonth ? avg(window(lastMonth)) : null;
      const yearAgo = lastMonth ? avg(window(shiftMonth(lastMonth, -12))) : null;
      const firstKeys = [...values.keys()].sort().slice(0, 3);
      const first = yearAgo ?? (values.size >= 6 ? avg(firstKeys) : null);
      const basis: FormSeries['basis'] = yearAgo !== null ? 'year_ago' : first !== null ? 'first_months' : null;
      const change = first === null || last === null ? null : last - first;
      const direction = change === null || spec.better === null ? null : Math.abs(change) < noise(key) ? 'steady' : (change > 0) === (spec.better === 'higher') ? 'better' : 'worse';
      return [
        key,
        {
          label: spec.label,
          unit: spec.unit,
          better: spec.better,
          points,
          first: first === null ? null : round(first, spec.digits),
          last: last === null ? null : round(last, spec.digits),
          change: change === null ? null : round(change, spec.digits),
          direction,
          basis,
          per_speed: round(slope, 3),
        },
      ];
    }),
  ) as Record<FormMeasure, FormSeries>;

  return {
    runs: runs.length,
    since: String(runs[0]!.calendar_date),
    reference_pace_s: Math.round(1000 / refSpeed),
    measures,
  };
}

export interface FormSeries {
  label: string;
  unit: string;
  better: 'higher' | 'lower' | null;
  /** Every month from the first to the last; value null where there were fewer than three easy runs. */
  points: Array<{ month: string; runs: number; value: number | null }>;
  /** What `first` is: the same three months a year before the last three, or the first three months of data. */
  basis: 'year_ago' | 'first_months' | null;
  first: number | null;
  last: number | null;
  change: number | null;
  direction: 'better' | 'worse' | 'steady' | null;
  per_speed: number;
}

export type FormTrend = NonNullable<ReturnType<typeof getFormTrend>>;

/** Changes smaller than this are within what the watch's measurement and run-to-run variation produce. */
function noise(key: FormMeasure): number {
  return { cadence: 2, step_length: 0.02, gct: 5, vertical_ratio: 0.2, vertical_oscillation: 0.2, power: 5 }[key];
}

/** Least-squares slope of the measure against speed, after removing each month's own average from both. */
function withinMonthSlope(groups: Row[][], value: (r: Row) => number | null): number {
  let sxy = 0;
  let sxx = 0;
  for (const group of groups) {
    const pairs = group.map((r) => [Number(r.avg_speed_mps), value(r)] as const).filter((p): p is readonly [number, number] => p[1] !== null);
    if (pairs.length < 2) continue;
    const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    const my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
    for (const [x, y] of pairs) {
      sxy += (x - mx) * (y - my);
      sxx += (x - mx) ** 2;
    }
  }
  return sxx > 0 ? sxy / sxx : 0;
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
const nextMonth = (month: string) => shiftMonth(month, 1);
