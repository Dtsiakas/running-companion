import { ENGLISH, type I18n } from '@companion/i18n';
import { distanceName } from './progress.ts';
import type { DatabaseSync } from 'node:sqlite';
import { getActivity, getWeek, getWeeklySummary } from '@companion/queries';
import { addDays, clockFromMinutes, loadDays, type Day } from './days.ts';
import { getSignals } from './signals.ts';
import { summarize } from './stats.ts';

type Row = Record<string, unknown>;

/** One line of the report. The tone marks it (✓, ▲ or neither), so the week can be read at a glance. */
export interface ReportLine {
  text: string;
  tone: 'good' | 'neutral' | 'concern';
}

export interface WeeklyReport {
  week_start: string;
  week_end: string;
  /** False while the week is still running: its numbers cover the days so far. */
  complete: boolean;
  /** One sentence: what kind of week it was. */
  headline: string;
  training: ReportLine[];
  recovery: ReportLine[];
  life: ReportLine[];
  body: ReportLine[];
  key_sessions: Array<{ activity_id: number; date: string; name: string; verdict: string }>;
  bests: Array<{ distance: string; time: string; scope: 'all-time' | 'year'; activity_id: number; date: string }>;
  signals: Array<{ title: string; level: 'warning' | 'watch' | 'positive'; days: number }>;
}

const KEY_CATEGORIES = new Set(['threshold', 'intervals', 'tempo', 'sprint', 'test', 'long']);
/** Distances a weekly best is reported for. */
const BEST_DISTANCES = new Set(['1000', '1609.344', '3000', '5000', '10000', '21097.5']);

/**
 * The week as a short written report, built only from the data: the same facts every time, with or without Claude.
 * Comparisons are with the previous week (what changed) and the four weeks before (what's normal for you lately);
 * Claude's review, when you ask for one, starts from this report.
 */
export function getWeeklyReport(db: DatabaseSync, weekStart: string, today: string, i18n: I18n = ENGLISH): WeeklyReport | null {
  const { m, f } = i18n;
  const t = m.report;
  const relative = (value: number, usual: number) => {
    const change = value / usual - 1;
    return Math.abs(change) < 0.05 ? t.inLine : change > 0 ? t.above(pct(change)) : t.below(pct(change));
  };
  const week = getWeek(db, weekStart, i18n);
  const summary = week.summary;
  if (!summary) return null;
  const start = week.week_start;
  const end = week.week_end;
  const complete = end < today;

  // The four weeks before this one: "your recent normal".
  const history = getWeeklySummary(db, 260).filter((w) => w.week_start! < start && w.week_start! >= addDays(start, -28));
  const mean = (xs: Array<number | null | undefined>) => {
    const v = xs.filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  // An unfinished week is compared with the same number of days of a usual week, not a whole one.
  const elapsed = complete ? 7 : Math.max(1, Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000) + 1);
  const fullWeekKm = mean(history.map((w) => w.km));
  const usualKm = fullWeekKm === null ? null : (fullWeekKm * elapsed) / 7;
  const usualHrv = mean(history.map((w) => w.avg_hrv_ms));
  const usualRhr = mean(history.map((w) => w.avg_resting_hr));

  const days = loadDays(db, start, complete ? end : today);
  const before = loadDays(db, addDays(start, -28), addDays(start, -1));

  // Training ------------------------------------------------------------------------------------------------------------
  const training: ReportLine[] = [];
  const km = summary.km ?? 0;
  training.push({
    text: `${t.volume(summary.runs ?? 0, f.distance(km), f.hoursMinutes(summary.hours))}${usualKm ? (complete ? t.vsAverage(relative(km, usualKm), f.distance(usualKm)) : t.vsSoFar(relative(km, usualKm), elapsed, f.distance(usualKm))) : ''}.`,
    tone: 'neutral',
  });
  if (summary.longest_km) training.push({ text: t.longest(f.distance(summary.longest_km)), tone: 'neutral' });
  const easy = summary.intensity_pct?.low;
  if (easy !== null && easy !== undefined) {
    training.push({
      text: t.easy(easy, easy >= 80, easy < 65),
      tone: easy >= 80 ? 'good' : easy < 65 ? 'concern' : 'neutral',
    });
  }
  if (summary.form_end !== null) {
    training.push({ text: t.form(f.signed(summary.form_end, 1), f.number(summary.fitness_end, 1)), tone: summary.form_end < -30 ? 'concern' : 'neutral' });
  }

  // Key sessions: the workouts with a purpose, and how they went against the plan.
  const keySessions = week.runs
    .filter((run) => KEY_CATEGORIES.has(run.category ?? ''))
    .map((run) => {
      const detail = getActivity(db, run.activity_id!, i18n);
      const steps = 'executed_steps' in detail ? (detail.executed_steps ?? []).filter((s) => s.on_target !== null) : [];
      const onTarget = steps.filter((s) => s.on_target === 'on').length;
      const parts: string[] = [t.session(f.distance(run.distance_km, 2), run.pace ?? '–', String(run.avg_hr ?? '–'))];
      if (steps.length) parts.push(onTarget === steps.length ? t.everyStep : t.stepsOn(onTarget, steps.length));
      if (run.category === 'long' && run.decoupling_pct !== null) parts.push(t.decoupling(f.percent(run.decoupling_pct, 1), run.decoupling_pct < 5));
      return { activity_id: run.activity_id!, date: run.date!, name: run.name ?? t.run, verdict: parts.join(', ') };
    })
    .reverse();

  // Recovery -------------------------------------------------------------------------------------------------------------
  const recovery: ReportLine[] = [];
  if (summary.avg_hrv_ms && usualHrv) {
    const change = summary.avg_hrv_ms / usualHrv - 1;
    recovery.push({
      text: t.hrv(Math.round(summary.avg_hrv_ms), Math.abs(change) < 0.02 ? t.inLine : change >= 0 ? t.above(pct(change)) : t.below(pct(change))),
      tone: change >= 0.03 ? 'good' : change <= -0.05 ? 'concern' : 'neutral',
    });
  }
  if (summary.avg_resting_hr && usualRhr) {
    const change = summary.avg_resting_hr - usualRhr;
    recovery.push({
      text: Math.abs(change) < 0.5 ? t.rhrSteady(f.number(summary.avg_resting_hr, 1)) : t.rhr(f.number(summary.avg_resting_hr, 1), f.number(Math.abs(change), 1), change > 0),
      tone: change >= 2 ? 'concern' : change <= -1 ? 'good' : 'neutral',
    });
  }
  const statuses = week.days.map((d) => d.status);
  const red = statuses.filter((s) => s === 'red').length;
  const amber = statuses.filter((s) => s === 'amber').length;
  const green = statuses.filter((s) => s === 'green').length;
  if (green + amber + red) {
    recovery.push({ text: t.statuses(green, amber, red), tone: red >= 2 ? 'concern' : amber + red === 0 ? 'good' : 'neutral' });
  }

  // Sleep: length against Garmin's need, quality, and how regular bedtimes were.
  const slept = summarize(values(days, 'sleep_h'));
  const need = mean(week.days.map((d) => d.sleep_need_h));
  if (slept.n) {
    const short = need ? need - slept.mean : null;
    recovery.push({
      text: t.sleep(f.hoursMinutes(slept.mean), need ? f.hoursMinutes(need) : null, short !== null && short >= 0.75 ? f.hoursMinutes(short) : null),
      tone: short !== null && short >= 1 ? 'concern' : short !== null && short <= 0.25 ? 'good' : 'neutral',
    });
  }
  const scores = summarize(values(days, 'sleep_score'));
  const scoresBefore = summarize(values(before, 'sleep_score'));
  if (scores.n && scoresBefore.n) {
    const change = scores.mean - scoresBefore.mean;
    recovery.push({ text: t.sleepScore(Math.round(scores.mean), Math.abs(change) >= 3 ? Math.round(change) : null), tone: change >= 3 ? 'good' : change <= -5 ? 'concern' : 'neutral' });
  }
  const bedtimes = summarize(values(days, 'bedtime_min'));
  if (bedtimes.n >= 4) {
    recovery.push({
      text: t.bedtime(clockFromMinutes(bedtimes.mean), bedtimes.sd >= 60 ? Math.round(bedtimes.sd) : null),
      tone: bedtimes.sd >= 60 ? 'concern' : 'neutral',
    });
  }

  // Life: stress and energy -----------------------------------------------------------------------
  const life: ReportLine[] = [];
  const stress = summarize(values(days, 'stress'));
  const stressBefore = summarize(values(before, 'stress'));
  if (stress.n && stressBefore.n) {
    const change = stress.mean - stressBefore.mean;
    life.push({ text: t.stress(Math.round(stress.mean), Math.abs(change) >= 2 ? Math.round(stressBefore.mean) : null, change > 0), tone: change >= 4 ? 'concern' : change <= -2 ? 'good' : 'neutral' });
  }
  const battery = summarize(values(days, 'body_battery'));
  if (battery.n) life.push({ text: t.battery(Math.round(battery.mean)), tone: battery.mean >= 80 ? 'good' : battery.mean < 60 ? 'concern' : 'neutral' });

  // Body -----------------------------------------------------------------------------------------------------------------
  const body: ReportLine[] = [];
  const weightChange = weekChange(db, start, end, i18n);
  if (weightChange) body.push(weightChange);

  // Bests and signals ---------------------------------------------------------------------------------------------------------
  const bests = newBests(db, start, end, i18n);
  const signalCounts = new Map<string, { title: string; level: 'warning' | 'watch' | 'positive'; days: number }>();
  for (const day of days) {
    for (const signal of getSignals(db, day.date, i18n)) {
      const seen = signalCounts.get(signal.id);
      signalCounts.set(signal.id, { title: signal.title, level: seen && seen.level === 'warning' ? 'warning' : signal.level, days: (seen?.days ?? 0) + 1 });
    }
  }

  return {
    week_start: start,
    week_end: end,
    complete,
    headline: headline(km, usualKm, summary.avg_hrv_ms, usualHrv, red, complete, t),
    training,
    recovery,
    life,
    body,
    key_sessions: keySessions,
    bests,
    signals: [...signalCounts.values()].sort((a, b) => ({ warning: 0, watch: 1, positive: 2 })[a.level] - ({ warning: 0, watch: 1, positive: 2 })[b.level] || b.days - a.days),
  };
}

/** "A lighter week, and recovery improved." The volume word follows the plan's own logic: lighter is often deliberate. */
function headline(km: number, usualKm: number | null, hrv: number | null, usualHrv: number | null, red: number, complete: boolean, t: I18n['m']['report']): string {
  const h = t.headline;
  const volume = !usualKm ? h.plain : km >= usualKm * 1.15 ? h.bigger : km <= usualKm * 0.75 ? h.lighter : h.steady;
  let recovery = '';
  if (red >= 2) recovery = h.strain;
  else if (hrv && usualHrv && hrv / usualHrv - 1 >= 0.03) recovery = h.improved;
  else if (hrv && usualHrv && hrv / usualHrv - 1 <= -0.05) recovery = h.dipped;
  const text = `${volume}${recovery}.`;
  return complete ? text : h.soFar(text);
}

/** Weight trend over the week. Losing more than about 1% of body weight a week while training hard is worth flagging. */
function weekChange(db: DatabaseSync, start: string, end: string, { m, f }: I18n): ReportLine | null {
  const at = (date: string) => (db.prepare('SELECT weight_trend_kg AS w FROM daily_metrics WHERE calendar_date <= ? AND weight_trend_kg IS NOT NULL ORDER BY calendar_date DESC LIMIT 1').get(date) as Row | undefined)?.w;
  const first = at(addDays(start, -1));
  const last = at(end);
  if (first === undefined || last === undefined || first === null || last === null) return null;
  const change = Number(last) - Number(first);
  const share = change / Number(first);
  return {
    text: m.report.weight(f.weight(Number(last)), Math.abs(change) < 0.1 ? null : f.weight(Math.abs(change)), change > 0, share <= -0.01),
    tone: share <= -0.01 ? 'concern' : 'neutral',
  };
}

/** Best efforts inside this week's runs that beat everything before: ever, or in the last year. */
function newBests(db: DatabaseSync, start: string, end: string, i18n: I18n): WeeklyReport['bests'] {
  const rows = db
    .prepare(
      `SELECT e.distance_m, e.duration_s, a.activity_id, a.calendar_date,
              (SELECT MIN(e2.duration_s) FROM activity_best_efforts e2 JOIN activities a2 USING (activity_id) WHERE e2.distance_m = e.distance_m AND a2.calendar_date < ?) AS before_ever,
              (SELECT MIN(e2.duration_s) FROM activity_best_efforts e2 JOIN activities a2 USING (activity_id) WHERE e2.distance_m = e.distance_m AND a2.calendar_date < ? AND a2.calendar_date >= ?) AS before_year
       FROM activity_best_efforts e JOIN activities a USING (activity_id)
       WHERE a.calendar_date BETWEEN ? AND ? AND e.distance_m >= 1000`,
    )
    .all(start, start, addDays(start, -365), start, end) as Row[];
  const best = new Map<string, WeeklyReport['bests'][number] & { seconds: number }>();
  for (const row of rows) {
    const seconds = Number(row.duration_s);
    const ever = row.before_ever === null ? null : Number(row.before_ever);
    const year = row.before_year === null ? null : Number(row.before_year);
    const scope = ever !== null && seconds < ever ? 'all-time' : year !== null && seconds < year ? 'year' : null;
    if (!scope || !BEST_DISTANCES.has(String(row.distance_m))) continue;
    const distance = distanceName(Number(row.distance_m), i18n);
    const current = best.get(distance);
    if (!current || seconds < current.seconds) best.set(distance, { distance, time: clock(seconds), scope, activity_id: Number(row.activity_id), date: String(row.calendar_date), seconds });
  }
  return [...best.values()].map(({ seconds: _s, ...rest }) => rest);
}

const values = (days: Day[], key: keyof Day) => days.map((d) => d[key]).filter((v): v is number => typeof v === 'number');
const pct = (share: number) => `${Math.round(Math.abs(share) * 100)}%`;
function clock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}
