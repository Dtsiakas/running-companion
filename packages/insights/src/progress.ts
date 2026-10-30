import type { DatabaseSync } from 'node:sqlite';
import { ENGLISH, type I18n } from '@companion/i18n';
import { addDays } from './days.ts';

type Row = Record<string, unknown>;
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Distance marks in the reader's unit (km or miles). */
const DISTANCE_MARKS = [100, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10_000, 12_500, 15_000, 20_000];
const RUN_MARKS = [10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
/** "First time under" marks per distance (seconds), from slower to faster. */
const TIME_MARKS: Record<number, number[]> = {
  5000: [1800, 1650, 1500, 1440, 1380, 1320, 1260, 1200],
  10000: [3600, 3300, 3000, 2880, 2700, 2520, 2400],
  21097.5: [8100, 7200, 6600, 6300, 6000, 5700, 5400],
  42195: [16200, 14400, 13500, 12600, 11700, 10800],
};
/** A best-effort distance's name: "5 km", "Half marathon". */
export const distanceName = (metres: number, { m, f }: I18n = ENGLISH) => m.progress.distanceName[String(metres)] ?? f.distance(metres / 1000, 2);

interface Run {
  id: number;
  date: string;
  km: number;
  seconds: number;
  climb: number;
  start_local: string;
}

function loadRuns(db: DatabaseSync, to: string): Run[] {
  return (
    db
      .prepare(`SELECT activity_id, calendar_date, distance_m, duration_s, elevation_gain_m, start_time_local FROM activities WHERE type_key LIKE '%running%' AND calendar_date <= ? ORDER BY start_time`)
      .all(to) as Row[]
  ).map((r) => ({ id: Number(r.activity_id), date: String(r.calendar_date), km: Number(r.distance_m ?? 0) / 1000, seconds: Number(r.duration_s ?? 0), climb: Number(r.elevation_gain_m ?? 0), start_local: String(r.start_time_local) }));
}

/** Monday of the date's week. */
export function weekOf(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export interface Milestone {
  date: string;
  title: string;
  /** Milestones in one group replace each other on the same day: only the best "5 km under" mark of a day is kept. */
  group: string;
  kind: 'distance' | 'runs' | 'time' | 'record';
  activity_id: number | null;
}

/**
 * Lifetime totals, the milestones you've passed (with the day each one fell), the next ones with a rough arrival
 * date at your recent pace, records (longest run, biggest week and month, streaks) and personal bests per distance.
 */
export function getProgress(db: DatabaseSync, today: string, i18n: I18n = ENGLISH) {
  const { m, f } = i18n;
  // Distance marks count in the reader's unit: a mile runner passes 1,000 miles, not 1,609 km.
  const unit = f.toKm(1);
  const markTitle = (mark: number) => m.progress.inTotal(`${f.number(mark)} ${f.distanceUnit}`);
  const runs = loadRuns(db, today);
  const milestones: Milestone[] = [];
  let km = 0;
  runs.forEach((run, i) => {
    const before = km;
    km += run.km;
    for (const mark of DISTANCE_MARKS) if (before < mark * unit && km >= mark * unit) milestones.push({ date: run.date, title: markTitle(mark), group: `distance-${mark}`, kind: 'distance', activity_id: run.id });
    if (RUN_MARKS.includes(i + 1)) milestones.push({ date: run.date, title: m.progress.runs(f.number(i + 1)), group: `runs-${i + 1}`, kind: 'runs', activity_id: run.id });
  });
  milestones.push(...timeMilestones(db, today, i18n));
  milestones.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  // Recent pace: the last eight weeks, for "about when" on the next marks.
  const recent = runs.filter((r) => r.date > addDays(today, -56));
  const kmPerDay = recent.reduce((s, r) => s + r.km, 0) / 56;
  const runsPerDay = recent.length / 56;
  const eta = (missing: number, perDay: number) => (perDay > 0 ? addDays(today, Math.ceil(missing / perDay)) : null);
  const done = km / unit;
  const nextMark = DISTANCE_MARKS.find((mark) => mark > done);
  const nextRuns = RUN_MARKS.find((mark) => mark > runs.length);

  return {
    totals: { km: Math.round(km), runs: runs.length, hours: Math.round(runs.reduce((s, r) => s + r.seconds, 0) / 3600), climb_m: Math.round(runs.reduce((s, r) => s + r.climb, 0)), since: runs[0]?.date ?? null },
    next: [
      nextMark ? { title: markTitle(nextMark), progress: round(done), target: nextMark, unit: f.distanceUnit, eta: eta((nextMark - done) * unit, kmPerDay) } : null,
      nextRuns ? { title: m.progress.runs(f.number(nextRuns)), progress: runs.length, target: nextRuns, unit: 'runs', eta: eta(nextRuns - runs.length, runsPerDay) } : null,
    ].filter((x) => x !== null),
    milestones,
    records: records(runs, today),
    bests: personalBests(db, today, i18n),
  };
}

export type Progress = ReturnType<typeof getProgress>;

/** The first time each distance went under a round time, from the fastest stretch inside any run. */
function timeMilestones(db: DatabaseSync, today: string, i18n: I18n): Milestone[] {
  const efforts = db
    .prepare(`SELECT e.distance_m, e.duration_s, a.calendar_date, a.activity_id FROM activity_best_efforts e JOIN activities a USING (activity_id) WHERE a.calendar_date <= ? ORDER BY a.start_time`)
    .all(today) as Row[];
  const out: Milestone[] = [];
  for (const [distance, marks] of Object.entries(TIME_MARKS)) {
    const passed = new Set<number>();
    for (const e of efforts.filter((x) => Number(x.distance_m) === Number(distance))) {
      for (const mark of marks) {
        if (!passed.has(mark) && Number(e.duration_s) < mark) {
          passed.add(mark);
          out.push({ date: String(e.calendar_date), title: i18n.m.progress.under(distanceName(Number(distance), i18n), clock(mark)), group: `time-${distance}`, kind: 'time', activity_id: Number(e.activity_id) });
        }
      }
    }
  }
  // Only the most impressive mark per day and distance: going under 25:00 also means under 27:30 and 30:00.
  const best = new Map<string, Milestone>();
  for (const m of out) best.set(`${m.date}|${m.group}`, m);
  return [...best.values()];
}

function records(runs: Run[], today: string) {
  const longest = runs.reduce<Run | null>((best, r) => (!best || r.km > best.km ? r : best), null);
  const sum = (key: (r: Run) => string) => {
    const totals = new Map<string, number>();
    for (const r of runs) totals.set(key(r), (totals.get(key(r)) ?? 0) + r.km);
    return totals;
  };
  const weeks = sum((r) => weekOf(r.date));
  const months = sum((r) => r.date.slice(0, 7));
  const top = (totals: Map<string, number>) => [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  const bigWeek = top(weeks);
  const bigMonth = top(months);

  // Streaks of consecutive weeks with at least one run, and with at least three.
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(weekOf(r.date), (counts.get(weekOf(r.date)) ?? 0) + 1);
  const streak = (min: number) => {
    let best = 0;
    let bestEnd: string | null = null;
    let current = 0;
    if (!runs.length) return { best: 0, best_end: null, current: 0 };
    const thisWeek = weekOf(today);
    for (let week = weekOf(runs[0]!.date); week <= thisWeek; week = addDays(week, 7)) {
      const ok = (counts.get(week) ?? 0) >= min;
      // The week in progress doesn't break a streak just because it isn't over yet.
      if (ok) current++;
      else if (week !== thisWeek) current = 0;
      if (current > best) {
        best = current;
        bestEnd = week;
      }
    }
    return { best, best_end: bestEnd, current };
  };

  return {
    longest_run: longest ? { km: round(longest.km, 2), date: longest.date, activity_id: longest.id } : null,
    biggest_week: bigWeek ? { week_start: bigWeek[0], km: round(bigWeek[1]) } : null,
    biggest_month: bigMonth ? { month: bigMonth[0], km: round(bigMonth[1]) } : null,
    streak_any: streak(1),
    streak_three: streak(3),
  };
}

/** Fastest stretch for each distance, ever and this year (from inside any run, not only races). */
function personalBests(db: DatabaseSync, today: string, i18n: I18n) {
  const year = today.slice(0, 4);
  const rows = db
    .prepare(
      `SELECT e.distance_m, e.duration_s, a.calendar_date, a.activity_id FROM activity_best_efforts e JOIN activities a USING (activity_id)
       WHERE a.calendar_date <= ? ORDER BY e.distance_m, e.duration_s`,
    )
    .all(today) as Row[];
  const byDistance = new Map<number, Row[]>();
  for (const r of rows) byDistance.set(Number(r.distance_m), [...(byDistance.get(Number(r.distance_m)) ?? []), r]);
  return [...byDistance.entries()].map(([distance, list]) => {
    const best = list[0]!;
    const thisYear = list.find((r) => String(r.calendar_date).startsWith(year));
    return {
      distance: distanceName(distance, i18n),
      distance_m: distance,
      best_s: Math.round(Number(best.duration_s)),
      date: String(best.calendar_date),
      activity_id: Number(best.activity_id),
      this_year_s: thisYear ? Math.round(Number(thisYear.duration_s)) : null,
      set_this_year: String(best.calendar_date).startsWith(year),
    };
  });
}

/**
 * One year of running, against the year before: volume, consistency, the biggest days, personal bests set, how your
 * fitness and resting body changed from the start of the year to the end, and when and where you ran.
 */
export function getYearReview(db: DatabaseSync, year: number, today: string, i18n: I18n = ENGLISH) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31` < today ? `${year}-12-31` : today;
  if (from > today) return null;
  const all = loadRuns(db, to);
  const inYear = all.filter((r) => r.date >= from);
  const lastYear = all.filter((r) => r.date >= `${year - 1}-01-01` && r.date <= `${year - 1}-12-31`);
  if (!inYear.length) return null;
  const sumKm = (list: Run[]) => round(list.reduce((s, r) => s + r.km, 0));
  // The first year of someone's history starts with their first run, not on 1 January: "7 of 44 weeks" would
  // count weeks before they had the watch.
  const firstRun = all.reduce((first, r) => (r.date < first ? r.date : first), to);
  const counted = firstRun > from ? firstRun : from;
  const weeks = new Set(inYear.map((r) => weekOf(r.date)));
  // Calendar weeks (Monday to Sunday) touched by the period, counted the same way as the weeks that had a run;
  // days ÷ 7 could say "7 of 6" when the period starts on a Sunday.
  const totalWeeks = Math.round((Date.parse(`${weekOf(to)}T12:00:00Z`) - Date.parse(`${weekOf(counted)}T12:00:00Z`)) / (7 * 86_400_000)) + 1;

  const months = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const list = inYear.filter((r) => r.date.startsWith(month));
    return { month, km: sumKm(list), runs: list.length };
  });
  const hours = inYear.map((r) => Number(r.start_local.slice(11, 13)));
  const timeOfDay = { morning: hours.filter((h) => h >= 5 && h < 12).length, afternoon: hours.filter((h) => h >= 12 && h < 17).length, evening: hours.filter((h) => h >= 17 || h < 5).length };

  const metricAt = (column: string, start: string, end: string) => {
    const row = db.prepare(`SELECT AVG(${column}) AS v FROM daily_metrics WHERE calendar_date BETWEEN ? AND ? AND ${column} IS NOT NULL`).get(start, end) as Row;
    return row.v === null ? null : round(Number(row.v));
  };
  const firstMonth: [string, string] = [from, addDays(from, 30)];
  const lastMonth: [string, string] = [addDays(to, -30), to];
  const change = (column: string) => ({ start: metricAt(column, ...firstMonth), end: metricAt(column, ...lastMonth) });

  // Walk every best effort in time order: a personal best set this year is one faster than everything before it.
  const best = new Map<number, number>();
  const setThisYear = new Map<number, { distance: string; distance_m: number; seconds: number; date: string; activity_id: number }>();
  const efforts = db.prepare(`SELECT e.distance_m, e.duration_s, a.calendar_date, a.activity_id FROM activity_best_efforts e JOIN activities a USING (activity_id) WHERE a.calendar_date <= ? ORDER BY a.start_time`).all(to) as Row[];
  for (const e of efforts) {
    const d = Number(e.distance_m);
    const previous = best.get(d);
    if (previous === undefined || Number(e.duration_s) < previous) {
      best.set(d, Number(e.duration_s));
      if (String(e.calendar_date) >= from) setThisYear.set(d, { distance: distanceName(d, i18n), distance_m: d, seconds: Math.round(Number(e.duration_s)), date: String(e.calendar_date), activity_id: Number(e.activity_id) });
    }
  }

  const weather = db
    .prepare(
      `SELECT a.activity_id, a.calendar_date, w.temp_c, w.dew_point_c FROM activity_weather w JOIN activities a USING (activity_id) WHERE a.calendar_date BETWEEN ? AND ? ORDER BY w.temp_c`,
    )
    .all(from, to) as Row[];
  const places = (db.prepare(`SELECT COUNT(DISTINCT location_name) AS n FROM activities WHERE type_key LIKE '%running%' AND calendar_date BETWEEN ? AND ?`).get(from, to) as Row).n;
  const longest = inYear.reduce((best, r) => (r.km > best.km ? r : best), inYear[0]!);
  const weekTotals = new Map<string, number>();
  for (const r of inYear) weekTotals.set(weekOf(r.date), (weekTotals.get(weekOf(r.date)) ?? 0) + r.km);
  const bigWeek = [...weekTotals.entries()].sort((a, b) => b[1] - a[1])[0]!;

  return {
    year,
    complete: to === `${year}-12-31`,
    through: to,
    km: sumKm(inYear),
    runs: inYear.length,
    hours: Math.round(inYear.reduce((s, r) => s + r.seconds, 0) / 3600),
    climb_m: Math.round(inYear.reduce((s, r) => s + r.climb, 0)),
    weeks_with_runs: weeks.size,
    weeks: totalWeeks,
    /** Set when the history starts during this year: weeks and averages count from that date. */
    since: counted > from ? counted : null,
    km_per_week: round(sumKm(inYear) / totalWeeks),
    previous: lastYear.length ? { km: sumKm(lastYear), runs: lastYear.length } : null,
    months,
    longest_run: { km: round(longest.km, 2), date: longest.date, activity_id: longest.id },
    biggest_week: { week_start: bigWeek[0], km: round(bigWeek[1]) },
    bests_set: [...setThisYear.values()].sort((a, b) => a.distance_m - b.distance_m),
    fitness: { resting_hr: change('rhr'), hrv: change('hrv_ms'), weight: change('weight_trend_kg'), sleep_h: change('sleep_h') },
    time_of_day: timeOfDay,
    places: Number(places ?? 0),
    hottest: weather.length ? { date: String(weather.at(-1)!.calendar_date), temp_c: round(Number(weather.at(-1)!.temp_c)), activity_id: Number(weather.at(-1)!.activity_id) } : null,
    coldest: weather.length ? { date: String(weather[0]!.calendar_date), temp_c: round(Number(weather[0]!.temp_c)), activity_id: Number(weather[0]!.activity_id) } : null,
  };
}

export type YearReview = NonNullable<ReturnType<typeof getYearReview>>;

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
