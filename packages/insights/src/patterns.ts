import type { DatabaseSync } from 'node:sqlite';
import { ENGLISH, type I18n } from '@companion/i18n';
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

type T = I18n['m']['patterns'];
type OutcomeKey = keyof T['outcome'];

interface Outcome {
  /** Which message names this outcome. */
  label: OutcomeKey;
  /** Which day's row holds the outcome, relative to the exposure day: 0 = same row, 1 = the next. */
  offset: number;
  value: (day: Day) => number | null;
  /** How to state the difference: relative for HRV (log scale), absolute points or units otherwise. */
  kind: 'percent' | 'points' | 'bpm' | 'percent-of-mean';
  /** For sentences: whether higher is better (HRV, sleep score, Body Battery) or worse (resting heart rate). */
  higherIsBetter: boolean;
}

const HRV: Omit<Outcome, 'offset'> = { label: 'hrv', value: (d) => (d.hrv ? Math.log(d.hrv) : null), kind: 'percent', higherIsBetter: true };
const SLEEP_SCORE: Omit<Outcome, 'offset'> = { label: 'sleepScore', value: (d) => d.sleep_score, kind: 'points', higherIsBetter: true };
const BODY_BATTERY: Omit<Outcome, 'offset'> = { label: 'bodyBattery', value: (d) => d.body_battery, kind: 'points', higherIsBetter: true };
const RECHARGE: Omit<Outcome, 'offset'> = { label: 'recharge', value: (d) => d.recharge, kind: 'points', higherIsBetter: true };
const RHR: Omit<Outcome, 'offset'> = { label: 'rhr', value: (d) => d.rhr, kind: 'bpm', higherIsBetter: false };

export function getPatterns(db: DatabaseSync, today: string, i18n: I18n = ENGLISH): Pattern[] {
  const t = i18n.m.patterns;
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
    // An outcome the watch never records (HRV on some models, Body Battery events) is left out, rather than shown
    // as "needs at least 8 days" forever.
    const recorded = outcomes.filter((outcome) => days.some((d) => outcome.value(d) !== null && outcome.value(d) !== undefined));
    const results = recorded.map((outcome) => {
      const collect = (test: (d: Day) => boolean) =>
        days.filter(test).flatMap((d) => {
          const target = shifted(d, outcome.offset);
          const value = target ? outcome.value(target) : null;
          return value === null || value === undefined ? [] : [value];
        });
      return result(outcome, groups.a.label, collect(groups.a.test), groups.b.label, collect(groups.b.test), minimum, i18n);
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
      t.bedtime.title,
      t.bedtime.comparison(clockFromMinutes(lateFrom), clockFromMinutes(earlyUntil)),
      { a: { label: t.bedtime.after(clockFromMinutes(lateFrom)), test: (d) => d.bedtime_min !== null && d.bedtime_min >= lateFrom }, b: { label: t.bedtime.before(clockFromMinutes(earlyUntil)), test: (d) => d.bedtime_min !== null && d.bedtime_min <= earlyUntil } },
      [
        { ...HRV, offset: 0 },
        { ...SLEEP_SCORE, offset: 0 },
        { ...RECHARGE, offset: 0 },
        { ...BODY_BATTERY, offset: 0 },
      ],
      MIN_DAYS,
      t.bedtime.caveat,
    ),
  );

  // Sleep length: the night itself, and resting heart rate measured over the following day.
  patterns.push(
    evaluate(
      'sleep-length',
      t.shortNights.title,
      t.shortNights.comparison,
      { a: { label: t.shortNights.short, test: (d) => d.sleep_h !== null && d.sleep_h < 6.5 }, b: { label: t.shortNights.long, test: (d) => d.sleep_h !== null && d.sleep_h >= 7.5 } },
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
  const hardLabel = hard === topQuarter ? t.hard.topQuarter(Math.round(hard)) : t.hard.fixed(hard);
  patterns.push(
    evaluate(
      'hard-session',
      t.hard.title,
      t.hard.comparison(hardLabel),
      { a: { label: t.hard.hardDay, test: (d) => (d.load ?? 0) >= hard }, b: { label: t.hard.restDay, test: (d) => d.load === 0 } },
      [
        { ...HRV, label: 'hrvNightAfter', offset: 1 },
        { ...HRV, label: 'hrvTwoNightsAfter', offset: 2 },
        { ...RHR, label: 'rhrDayAfter', offset: 1 },
      ],
      MIN_DAYS,
      t.hard.caveat,
    ),
  );

  // Stressful days: the following night.
  const stress = days.map((d) => d.stress).filter((s): s is number => s !== null);
  const high = percentile(stress, 0.75);
  const low = percentile(stress, 0.25);
  patterns.push(
    evaluate(
      'stress',
      t.stress.title,
      t.stress.comparison(Math.round(high), Math.round(low)),
      { a: { label: t.stress.stressful, test: (d) => d.stress !== null && d.stress >= high && (d.load ?? 0) < hard }, b: { label: t.stress.calm, test: (d) => d.stress !== null && d.stress <= low && (d.load ?? 0) < hard } },
      [
        { ...HRV, label: 'hrvNightAfter', offset: 1 },
        { ...SLEEP_SCORE, label: 'sleepScoreNightAfter', offset: 1 },
      ],
      MIN_DAYS,
      t.stress.caveat,
    ),
  );

  patterns.push(eveningRuns(db, today, byDate, evaluate, t));
  patterns.push(...runPatterns(db, today, byDate, i18n));

  const order = { effect: 0, no_effect: 1, not_enough: 2 };
  return patterns.filter((p) => p.results.length > 0).sort((a, b) => order[a.status] - order[b.status]);
}

type Evaluate = (id: string, title: string, comparison: string, groups: { a: { label: string; test: (d: Day) => boolean }; b: { label: string; test: (d: Day) => boolean } }, outcomes: Outcome[], minimum?: number, caveat?: string | null) => Pattern;

/**
 * Does running late in the day cost sleep? Run days are grouped by when the run started (the latest run that day);
 * the outcome is the night that follows, which sits in the next day's row.
 */
function eveningRuns(db: DatabaseSync, today: string, byDate: Map<string, Day>, evaluate: Evaluate, t: T): Pattern {
  const starts = new Map(
    (db.prepare(`SELECT calendar_date, MAX(substr(start_time_local, 12, 5)) AS start FROM activities WHERE calendar_date >= ? AND type_key LIKE '%running%' GROUP BY calendar_date`).all(addDays(today, -365 * YEARS)) as Row[]).map((r) => [String(r.calendar_date), String(r.start)]),
  );
  const startOf = (d: Day) => starts.get(d.date);
  return evaluate(
    'evening-runs',
    t.evening.title,
    t.evening.comparison,
    { a: { label: t.evening.late, test: (d) => (startOf(d) ?? '') >= '19:00' }, b: { label: t.evening.early, test: (d) => { const s = startOf(d); return s !== undefined && s < '17:00'; } } },
    [
      { ...SLEEP_SCORE, label: 'sleepScoreThatNight', offset: 1 },
      { ...RECHARGE, label: 'recharge', offset: 1 },
      { ...HRV, label: 'hrvThatNight', offset: 1 },
    ],
    MIN_DAYS,
    t.evening.caveat,
  );
}

/** How the run itself responds: efficiency (metres per heartbeat) on easy outdoor runs, the measure least affected by pace choice. */
function runPatterns(db: DatabaseSync, today: string, byDate: Map<string, Day>, i18n: I18n): Pattern[] {
  const t = i18n.m.patterns;
  const runs = db
    .prepare(
      `SELECT a.calendar_date, m.m_per_beat, w.temp_c, w.dew_point_c FROM activities a JOIN activity_metrics m USING (activity_id) LEFT JOIN activity_weather w USING (activity_id)
       WHERE m.category IN ('easy', 'long', 'recovery') AND m.is_treadmill = 0 AND m.m_per_beat IS NOT NULL AND a.calendar_date >= ?`,
    )
    .all(addDays(today, -365 * YEARS)) as Row[];
  const efficiency: Omit<Outcome, 'offset' | 'value'> = { label: 'efficiency', kind: 'percent-of-mean', higherIsBetter: true };
  const make = (id: string, title: string, comparison: string, a: [string, (r: Row) => boolean], b: [string, (r: Row) => boolean]): Pattern => {
    const pick = (test: (r: Row) => boolean) => runs.filter(test).map((r) => Number(r.m_per_beat));
    const [aRuns, bRuns] = [pick(a[1]), pick(b[1])];
    // Neither group has a single run (no weather without GPS, no Body Battery on some watches): nothing to say.
    const results = aRuns.length + bRuns.length ? [result({ ...efficiency, offset: 0, value: () => null }, a[0], aRuns, b[0], bRuns, MIN_DAYS, i18n)] : [];
    return { id, title, comparison, results, caveat: t.runs.caveat, status: overall(results) };
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
      t.runs.shortNightTitle,
      t.runs.shortNightComparison,
      [t.runs.afterShort, (r) => (night(r)?.sleep_h ?? 99) < 6.5],
      [t.runs.afterFull, (r) => (night(r)?.sleep_h ?? 0) >= 7.5],
    ),
    make(
      'run-body-battery',
      t.runs.batteryTitle,
      t.runs.batteryComparison,
      [t.runs.batteryLow, (r) => (night(r)?.body_battery ?? 100) < 60],
      [t.runs.batteryHigh, (r) => (night(r)?.body_battery ?? 0) >= 80],
    ),
    make(
      'run-heat',
      t.runs.heatTitle,
      t.runs.heatComparison,
      [t.runs.warm, (r) => (heatOf(r) ?? -Infinity) >= warm],
      [t.runs.cool, (r) => (heatOf(r) ?? Infinity) <= cool],
    ),
  ];
}

function result(outcome: Outcome, aLabel: string, a: number[], bLabel: string, b: number[], minimum: number, { m, f }: I18n): PatternResult {
  const t = m.patterns;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const display = (m: number | null) => (m === null ? null : outcome.kind === 'percent' ? Math.round(Math.exp(m)) : Math.round(m * 1000) / 1000);
  const base = { outcome: t.outcome[outcome.label], a: { label: aLabel, n: a.length, mean: display(mean(a)) }, b: { label: bLabel, n: b.length, mean: display(mean(b)) } };
  if (a.length < minimum || b.length < minimum) {
    return { ...base, status: 'not_enough', difference: t.needs(minimum, a.length, b.length), strength: null, p: null };
  }
  const c = compare(a, b)!;
  const amount =
    outcome.kind === 'percent'
      ? `${Math.round(Math.abs(Math.exp(c.difference) - 1) * 100)}%`
      : outcome.kind === 'percent-of-mean'
        ? `${Math.round(Math.abs(c.difference / c.b.mean) * 100)}%`
        : outcome.kind === 'bpm'
          ? `${f.number(Math.abs(c.difference), 1)} bpm`
          : t.points(Math.round(Math.abs(c.difference)));
  const stated = c.difference > 0 ? t.higher(amount) : t.lower(amount);
  if (c.p < 0.05 && Math.abs(c.d) >= 0.25) {
    return { ...base, status: 'effect', difference: stated, strength: c.p < 0.01 && Math.abs(c.d) >= 0.4 ? 'strong' : 'moderate', p: c.p };
  }
  // Real but tiny (many days make even small differences detectable) is different from no difference at all.
  const difference = c.p < 0.05 ? t.tiny(stated) : t.noDifference;
  return { ...base, status: 'no_effect', difference, strength: null, p: c.p };
}

function overall(results: PatternResult[]): PatternResult['status'] {
  if (results.some((r) => r.status === 'effect')) return 'effect';
  if (results.some((r) => r.status === 'no_effect')) return 'no_effect';
  return 'not_enough';
}

