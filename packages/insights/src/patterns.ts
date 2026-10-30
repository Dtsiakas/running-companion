import type { DatabaseSync } from 'node:sqlite';
import { addDays, clockFromMinutes, loadDays, type Day } from './days.ts';
import { compare, percentile } from './stats.ts';

type Row = Record<string, unknown>;

/**
 * "What works for you": comparisons between two kinds of days in your own history, each with a statistical test.
 *
 * - effect: a difference big enough to matter (Cohen's d ≥ 0.25) and unlikely to be chance (p < 0.05)
 * - no_effect: enough days on both sides, and no clear difference: also worth knowing
 * - not_enough: too few days on one side yet
 *
 * These are associations, not proof of cause: a late bedtime and a low HRV can both come from a stressful day.
 */
export interface PatternResult {
  outcome: string;
  status: 'effect' | 'no_effect' | 'not_enough';
  /** "9% lower", "6 points higher", "no clear difference" */
  difference: string;
  strength: 'strong' | 'moderate' | null;
  a: { label: string; n: number; mean: number | null };
  b: { label: string; n: number; mean: number | null };
  p: number | null;
}

export interface Pattern {
  id: string;
  /** "Late bedtimes" */
  title: string;
  /** "Nights you went to bed after 00:30, compared with nights before 23:30" */
  comparison: string;
  results: PatternResult[];
  /** What to keep in mind when reading this one. */
  caveat: string | null;
  /** The most notable result's status, for sorting. */
  status: PatternResult['status'];
}

const YEARS = 2;
const MIN_DAYS = 8;

interface Outcome {
  label: string;
  /** Which day's row holds the outcome, relative to the exposure day: 0 = same row, 1 = the next. */
  offset: number;
  value: (day: Day) => number | null;
  /** How to state the difference: relative for HRV (log scale), absolute points or units otherwise. */
  kind: 'percent' | 'points' | 'bpm' | 'percent-of-mean';
  /** For sentences: whether higher is better (HRV, sleep score, Body Battery) or worse (resting heart rate). */
  higherIsBetter: boolean;
}

const HRV: Omit<Outcome, 'offset'> = { label: 'HRV', value: (d) => (d.hrv ? Math.log(d.hrv) : null), kind: 'percent', higherIsBetter: true };
const SLEEP_SCORE: Omit<Outcome, 'offset'> = { label: 'Sleep score', value: (d) => d.sleep_score, kind: 'points', higherIsBetter: true };
const BODY_BATTERY: Omit<Outcome, 'offset'> = { label: 'Body Battery in the morning', value: (d) => d.body_battery, kind: 'points', higherIsBetter: true };
const RECHARGE: Omit<Outcome, 'offset'> = { label: 'Overnight recharge', value: (d) => d.recharge, kind: 'points', higherIsBetter: true };
const RHR: Omit<Outcome, 'offset'> = { label: 'Resting heart rate', value: (d) => d.rhr, kind: 'bpm', higherIsBetter: false };

export function getPatterns(db: DatabaseSync, today: string): Pattern[] {
  const days = loadDays(db, addDays(today, -365 * YEARS), today);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const shifted = (day: Day, offset: number) => (offset === 0 ? day : byDate.get(addDays(day.date, offset)));

  /** Compares the outcomes of two groups of days. The exposure is on the day; the outcome `offset` days later. */
  const evaluate = (
    id: string,
    title: string,
    comparison: string,
    groups: { a: { label: string; test: (d: Day) => boolean }; b: { label: string; test: (d: Day) => boolean } },
    outcomes: Outcome[],
    minimum = MIN_DAYS,
    caveat: string | null = null,
  ): Pattern => {
    const results = outcomes.map((outcome) => {
      const collect = (test: (d: Day) => boolean) =>
        days.filter(test).flatMap((d) => {
          const target = shifted(d, outcome.offset);
          const value = target ? outcome.value(target) : null;
          return value === null || value === undefined ? [] : [value];
        });
      return result(outcome, groups.a.label, collect(groups.a.test), groups.b.label, collect(groups.b.test), minimum);
    });
    return { id, title, comparison, results, caveat, status: overall(results) };
  };

  const patterns: Pattern[] = [];

  // Bedtime: the night itself. Thirds of your own bedtimes, not fixed clock times: what counts as late depends on
  // what's normal for you, and fixed times would compare your usual nights with rare ones.
  const bedtimes = days.map((d) => d.bedtime_min).filter((b): b is number => b !== null);
  const lateFrom = percentile(bedtimes, 2 / 3);
  const earlyUntil = percentile(bedtimes, 1 / 3);
  patterns.push(
    evaluate(
      'bedtime',
      'Late bedtimes',
      `Your latest third of bedtimes (after ${clockFromMinutes(lateFrom)}), compared with your earliest third (before ${clockFromMinutes(earlyUntil)})`,
      { a: { label: `after ${clockFromMinutes(lateFrom)}`, test: (d) => d.bedtime_min !== null && d.bedtime_min >= lateFrom }, b: { label: `before ${clockFromMinutes(earlyUntil)}`, test: (d) => d.bedtime_min !== null && d.bedtime_min <= earlyUntil } },
      [
        { ...HRV, offset: 0 },
        { ...SLEEP_SCORE, offset: 0 },
        { ...RECHARGE, offset: 0 },
        { ...BODY_BATTERY, offset: 0 },
      ],
      MIN_DAYS,
      'A late night often comes with a late wake-up, so it isn’t always a short night.',
    ),
  );

  // Sleep length: the night itself, and resting heart rate measured over the following day.
  patterns.push(
    evaluate(
      'sleep-length',
      'Short nights',
      'Nights under 6h30 of sleep, compared with nights of 7h30 or more',
      { a: { label: 'under 6h30', test: (d) => d.sleep_h !== null && d.sleep_h < 6.5 }, b: { label: '7h30 or more', test: (d) => d.sleep_h !== null && d.sleep_h >= 7.5 } },
      [
        { ...HRV, offset: 0 },
        { ...RECHARGE, offset: 0 },
        { ...RHR, offset: 0 },
      ],
    ),
  );

  // Hard training: the night after, and the night after that (how long it takes to bounce back).
  const loads = days.map((d) => d.load ?? 0).filter((l) => l > 0);
  // Your top quarter of training days, but never below a load of 100: in an easy period the top quarter isn't hard.
  const topQuarter = percentile(loads, 0.75);
  const hard = Math.max(100, topQuarter);
  const hardLabel = hard === topQuarter ? `load above ${Math.round(hard)}, your top quarter` : `load of ${hard} or more`;
  patterns.push(
    evaluate(
      'hard-session',
      'Hard sessions',
      `Days with a hard session (${hardLabel}), compared with rest days`,
      { a: { label: 'hard session', test: (d) => (d.load ?? 0) >= hard }, b: { label: 'rest day', test: (d) => d.load === 0 } },
      [
        { ...HRV, label: 'HRV the night after', offset: 1 },
        { ...HRV, label: 'HRV two nights after', offset: 2 },
        { ...RHR, label: 'Resting heart rate the day after', offset: 1 },
      ],
      MIN_DAYS,
      'Rest days aren’t random: some follow hard days or come when you feel run down, which can make the comparison look better or worse than it is.',
    ),
  );

  // Stressful days: the following night.
  const stress = days.map((d) => d.stress).filter((s): s is number => s !== null);
  const high = percentile(stress, 0.75);
  const low = percentile(stress, 0.25);
  patterns.push(
    evaluate(
      'stress',
      'Stressful days',
      `Days with high all-day stress (${Math.round(high)} or more, your top quarter), compared with calm days (${Math.round(low)} or less)`,
      { a: { label: 'stressful day', test: (d) => d.stress !== null && d.stress >= high && (d.load ?? 0) < hard }, b: { label: 'calm day', test: (d) => d.stress !== null && d.stress <= low && (d.load ?? 0) < hard } },
      [
        { ...HRV, label: 'HRV the night after', offset: 1 },
        { ...SLEEP_SCORE, label: 'Sleep score the night after', offset: 1 },
      ],
      MIN_DAYS,
      'Garmin calculates stress from heart rate variability, so part of this link is the same signal measured twice. Hard training days are left out, so it’s about life stress.',
    ),
  );

  patterns.push(eveningRuns(db, today, byDate, evaluate));
  patterns.push(...runPatterns(db, today, byDate));

  const order = { effect: 0, no_effect: 1, not_enough: 2 };
  return patterns.sort((a, b) => order[a.status] - order[b.status]);
}

type Evaluate = (id: string, title: string, comparison: string, groups: { a: { label: string; test: (d: Day) => boolean }; b: { label: string; test: (d: Day) => boolean } }, outcomes: Outcome[], minimum?: number, caveat?: string | null) => Pattern;

/**
 * Does running late in the day cost sleep? Run days are grouped by when the run started (the latest run that day);
 * the outcome is the night that follows, which sits in the next day's row.
 */
function eveningRuns(db: DatabaseSync, today: string, byDate: Map<string, Day>, evaluate: Evaluate): Pattern {
  const starts = new Map(
    (db.prepare(`SELECT calendar_date, MAX(substr(start_time_local, 12, 5)) AS start FROM activities WHERE calendar_date >= ? AND type_key LIKE '%running%' GROUP BY calendar_date`).all(addDays(today, -365 * YEARS)) as Row[]).map((r) => [String(r.calendar_date), String(r.start)]),
  );
  const startOf = (d: Day) => starts.get(d.date);
  return evaluate(
    'evening-runs',
    'Evening runs',
    'Days you ran from 19:00 on, compared with days you ran before 17:00. The outcome is the night after.',
    { a: { label: 'ran from 19:00', test: (d) => (startOf(d) ?? '') >= '19:00' }, b: { label: 'ran before 17:00', test: (d) => { const s = startOf(d); return s !== undefined && s < '17:00'; } } },
    [
      { ...SLEEP_SCORE, label: 'Sleep score that night', offset: 1 },
      { ...RECHARGE, label: 'Overnight recharge', offset: 1 },
      { ...HRV, label: 'HRV that night', offset: 1 },
    ],
    MIN_DAYS,
    'Evening runs are often the harder or longer sessions fitted in after work, so part of any difference can be the session, not the hour.',
  );
}

/** How the run itself responds: efficiency (metres per heartbeat) on easy outdoor runs, the measure least affected by pace choice. */
function runPatterns(db: DatabaseSync, today: string, byDate: Map<string, Day>): Pattern[] {
  const runs = db
    .prepare(
      `SELECT a.calendar_date, m.m_per_beat, w.temp_c, w.dew_point_c FROM activities a JOIN activity_metrics m USING (activity_id) LEFT JOIN activity_weather w USING (activity_id)
       WHERE m.category IN ('easy', 'long', 'recovery') AND m.is_treadmill = 0 AND m.m_per_beat IS NOT NULL AND a.calendar_date >= ?`,
    )
    .all(addDays(today, -365 * YEARS)) as Row[];
  const efficiency: Omit<Outcome, 'offset' | 'value'> = { label: 'Efficiency on easy runs', kind: 'percent-of-mean', higherIsBetter: true };
  const make = (id: string, title: string, comparison: string, a: [string, (r: Row) => boolean], b: [string, (r: Row) => boolean]): Pattern => {
    const pick = (test: (r: Row) => boolean) => runs.filter(test).map((r) => Number(r.m_per_beat));
    const results = [result({ ...efficiency, offset: 0, value: () => null }, a[0], pick(a[1]), b[0], pick(b[1]), MIN_DAYS)];
    return { id, title, comparison, results, caveat: 'Easy outdoor runs only. Efficiency also improves as you get fitter, so groups from different seasons can differ for that reason too.', status: overall(results) };
  };
  const night = (r: Row) => byDate.get(String(r.calendar_date));
  // Heat as temperature plus dew point (°F), the measure behind the pace-cost rule, from Open-Meteo at the time and
  // place of the run. Runs without synced weather are left out of this one comparison.
  const heatOf = (r: Row) => (r.temp_c === null || r.temp_c === undefined ? null : (Number(r.temp_c) * 9) / 5 + 32 + (Number(r.dew_point_c) * 9) / 5 + 32);
  const heats = runs.map(heatOf).filter((h): h is number => h !== null);
  const warm = percentile(heats, 2 / 3);
  const cool = percentile(heats, 1 / 3);
  return [
    make(
      'run-after-short-night',
      'Running after a short night',
      'Easy runs after under 6h30 of sleep, compared with after 7h30 or more',
      ['after a short night', (r) => (night(r)?.sleep_h ?? 99) < 6.5],
      ['after a full night', (r) => (night(r)?.sleep_h ?? 0) >= 7.5],
    ),
    make(
      'run-body-battery',
      'Running on a low battery',
      'Easy runs on mornings with Body Battery under 60, compared with 80 or more',
      ['Body Battery under 60', (r) => (night(r)?.body_battery ?? 100) < 60],
      ['Body Battery 80+', (r) => (night(r)?.body_battery ?? 0) >= 80],
    ),
    make(
      'run-heat',
      'Running in the heat',
      'Easy runs in your warmest, most humid third of conditions, compared with your coolest third. Heat is air temperature plus dew point, from Open-Meteo at the time and place of each run, not the watch sensor.',
      ['warm', (r) => (heatOf(r) ?? -Infinity) >= warm],
      ['cool', (r) => (heatOf(r) ?? Infinity) <= cool],
    ),
  ];
}

function result(outcome: Outcome, aLabel: string, a: number[], bLabel: string, b: number[], minimum: number): PatternResult {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const display = (m: number | null) => (m === null ? null : outcome.kind === 'percent' ? Math.round(Math.exp(m)) : Math.round(m * 1000) / 1000);
  const base = { outcome: outcome.label, a: { label: aLabel, n: a.length, mean: display(mean(a)) }, b: { label: bLabel, n: b.length, mean: display(mean(b)) } };
  if (a.length < minimum || b.length < minimum) {
    return { ...base, status: 'not_enough', difference: `needs at least ${minimum} days of each (now ${a.length} and ${b.length})`, strength: null, p: null };
  }
  const c = compare(a, b)!;
  const direction = c.difference > 0 ? 'higher' : 'lower';
  const amount =
    outcome.kind === 'percent'
      ? `${Math.round(Math.abs(Math.exp(c.difference) - 1) * 100)}%`
      : outcome.kind === 'percent-of-mean'
        ? `${Math.round(Math.abs(c.difference / c.b.mean) * 100)}%`
        : outcome.kind === 'bpm'
          ? `${Math.round(Math.abs(c.difference) * 10) / 10} bpm`
          : `${Math.round(Math.abs(c.difference))} points`;
  if (c.p < 0.05 && Math.abs(c.d) >= 0.25) {
    return { ...base, status: 'effect', difference: `${amount} ${direction}`, strength: c.p < 0.01 && Math.abs(c.d) >= 0.4 ? 'strong' : 'moderate', p: c.p };
  }
  // Real but tiny (many days make even small differences detectable) is different from no difference at all.
  const difference = c.p < 0.05 ? `only ${amount} ${direction}: real, but too small to matter` : 'no clear difference';
  return { ...base, status: 'no_effect', difference, strength: null, p: c.p };
}

function overall(results: PatternResult[]): PatternResult['status'] {
  if (results.some((r) => r.status === 'effect')) return 'effect';
  if (results.some((r) => r.status === 'no_effect')) return 'no_effect';
  return 'not_enough';
}

