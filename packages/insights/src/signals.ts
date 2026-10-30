import type { DatabaseSync } from 'node:sqlite';
import { ENGLISH, type I18n } from '@companion/i18n';
import { addDays, clockFromMinutes, loadDays, type Day } from './days.ts';
import { summarize } from './stats.ts';

type Row = Record<string, unknown>;

/**
 * Something worth knowing today, from rules over your recent data.
 * - warning: act on it today (ease off, rest, look after yourself)
 * - watch: a trend heading the wrong way, worth keeping an eye on
 * - positive: something going well, so the app isn't only ever bad news
 */
export interface Signal {
  id: string;
  level: 'warning' | 'watch' | 'positive';
  title: string;
  /** What the data shows, with the numbers. */
  detail: string;
  /** What to do about it, if anything. */
  action: string | null;
}

const BASELINE_DAYS = 60;

/**
 * Today's signals, most urgent first. Every rule compares you with your own recent normal (previous 60 days, today
 * excluded), never with population averages, and states its numbers so you can judge it yourself.
 * Garmin stays the coach: warnings say what the data shows and suggest easing off; they don't rewrite the plan.
 */
export function getSignals(db: DatabaseSync, date: string, i18n: I18n = ENGLISH): Signal[] {
  const { m, f } = i18n;
  const t = m.signals;
  const days = loadDays(db, addDays(date, -BASELINE_DAYS), date);
  const today = days.at(-1);
  if (!today || today.date !== date) return [];
  const history = days.slice(0, -1);
  const signals = [
    illnessWatch(today, history, t, f),
    overreaching(days.slice(-7), today, t, f),
    loadSpike(today, t, f),
    longRunJump(db, date, t, f),
    easyRunDrift(db, date, t),
    intensityBalance(db, date, t),
    sleepDebt(today, t, f),
    irregularBedtimes(days.slice(-14), t, f),
    // Today's stress covers only part of the day, so the streak is judged on the three complete days before it.
    stressStreak(history.slice(-3), history.slice(0, -3), t, f),
    underFuelling(days.slice(-22), today, t, f),
    // Today's charge and drain are still running, so judge the five complete days before it.
    batteryDrain(history.slice(-5), today, history, t, f),
    strongRecovery(today, t),
  ].filter((s): s is Signal => s !== null);
  const order = { warning: 0, watch: 1, positive: 2 };
  return signals.sort((a, b) => order[a.level] - order[b.level]);
}

const values = (days: Day[], key: keyof Day) => days.map((d) => d[key]).filter((v): v is number => typeof v === 'number');
type T = I18n['m']['signals'];
type F = I18n['f'];

/**
 * The classic early sign of illness is several systems shifting at once: resting heart rate up, HRV down and
 * breathing rate up during sleep. Any one alone is ordinary day-to-day noise; two or three together are not.
 */
function illnessWatch(today: Day, history: Day[], t: T, f: F): Signal | null {
  const markers: string[] = [];
  const rhr = summarize(values(history, 'rhr'));
  if (today.rhr !== null && rhr.n >= 20 && today.rhr - rhr.mean >= 3) markers.push(t.illness.rhr(f.number(today.rhr), f.number(today.rhr - rhr.mean, 1)));
  const hrv = summarize(values(history, 'hrv').map(Math.log));
  if (today.hrv !== null && hrv.n >= 20 && (Math.log(today.hrv) - hrv.mean) / hrv.sd <= -1.5)
    markers.push(t.illness.hrv(f.number(today.hrv), f.number(Math.exp(hrv.mean))));
  const breathing = summarize(values(history, 'breathing'));
  if (today.breathing !== null && breathing.n >= 20 && today.breathing - breathing.mean >= 1)
    markers.push(t.illness.breathing(f.number(today.breathing, 1), f.number(today.breathing - breathing.mean, 1)));
  if (markers.length < 2) return null;
  const strong = markers.length >= 3;
  return {
    id: 'illness-watch',
    level: strong ? 'warning' : 'watch',
    title: strong ? t.illness.strongTitle : t.illness.title,
    detail: t.illness.detail(markers.join('; ')),
    action: t.illness.action,
  };
}

/** Form deep in the negative for most of a week is normal in a build; with recovery also slipping, it's too much. */
function overreaching(week: Day[], today: Day, t: T, f: F): Signal | null {
  const deepDays = week.filter((d) => d.form !== null && d.form <= -25).length;
  if (deepDays < 5) return null;
  const hrvDown = today.hrv_7d_z !== null && today.hrv_7d_z <= -0.75;
  const rhrUp = today.rhr_3d !== null && today.rhr_baseline !== null && today.rhr_3d - today.rhr_baseline >= 2;
  if (!hrvDown && !rhrUp) return null;
  return {
    id: 'overreaching',
    level: 'warning',
    title: t.overreaching.title,
    detail: t.overreaching.detail(deepDays, f.list([hrvDown ? t.overreaching.hrvDown : null, rhrUp ? t.overreaching.rhrUp(f.number(today.rhr_3d! - today.rhr_baseline!, 1)) : null].filter((x): x is string => !!x))),
    action: t.overreaching.action,
  };
}

function loadSpike(today: Day, t: T, f: F): Signal | null {
  if (today.acwr === null || today.acwr < 1.3) return null;
  const spike = today.acwr >= 1.5;
  return {
    id: 'load-spike',
    level: spike ? 'warning' : 'watch',
    title: spike ? t.loadSpike.spikeTitle : t.loadSpike.title,
    detail: t.loadSpike.detail(f.number(today.acwr, 2), spike),
    action: spike ? t.loadSpike.action : null,
  };
}

/** A long run much longer than anything recently is a common way into calf, shin and Achilles trouble. */
function longRunJump(db: DatabaseSync, date: string, t: T, f: F): Signal | null {
  const longest = (from: string, to: string) =>
    Number(
      (db.prepare(`SELECT MAX(distance_m) AS m FROM activities WHERE type_key LIKE '%running%' AND calendar_date BETWEEN ? AND ?`).get(from, to) as Row).m ?? 0,
    ) / 1000;
  const recent = longest(addDays(date, -6), date);
  const before = longest(addDays(date, -34), addDays(date, -7));
  if (recent < 10 || before === 0 || recent < before * 1.25) return null;
  return {
    id: 'long-run-jump',
    level: 'watch',
    title: t.longRun.title,
    detail: t.longRun.detail(f.distance(recent), Math.round((recent / before - 1) * 100), f.distance(before)),
    action: t.longRun.action,
  };
}

/** Easy runs that drift above your first threshold stop being easy: more fatigue for little extra fitness. */
function easyRunDrift(db: DatabaseSync, date: string, t: T): Signal | null {
  const runs = db
    .prepare(
      `SELECT a.calendar_date, m.low_s, m.moderate_s, m.high_s, a.avg_temp_c FROM activities a JOIN activity_metrics m USING (activity_id)
       WHERE m.category IN ('easy', 'recovery', 'long') AND a.calendar_date <= ? AND a.calendar_date >= ?
       ORDER BY a.start_time DESC LIMIT 5`,
    )
    .all(date, addDays(date, -28)) as Row[];
  if (runs.length < 4) return null;
  const share = (r: Row) => (Number(r.moderate_s) + Number(r.high_s)) / (Number(r.low_s) + Number(r.moderate_s) + Number(r.high_s) || 1);
  const drifted = runs.filter((r) => share(r) > 0.25);
  if (drifted.length < 3) return null;
  const temps = runs.map((r) => Number(r.avg_temp_c)).filter((t) => t > 0);
  const hot = temps.length && temps.reduce((a, b) => a + b, 0) / temps.length >= 27;
  return {
    id: 'easy-drift',
    level: 'watch',
    title: t.easyDrift.title,
    detail: t.easyDrift.detail(drifted.length, runs.length, Math.round((runs.map(share).reduce((a, b) => a + b, 0) / runs.length) * 100), !!hot),
    action: t.easyDrift.action,
  };
}

/** The share of running time below the first threshold over four weeks: most endurance progress comes from a big easy share. */
function intensityBalance(db: DatabaseSync, date: string, t: T): Signal | null {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS runs, SUM(m.low_s) AS low, SUM(m.low_s + m.moderate_s + m.high_s) AS total FROM activities a JOIN activity_metrics m USING (activity_id)
       WHERE a.type_key LIKE '%running%' AND a.calendar_date BETWEEN ? AND ?`,
    )
    .get(addDays(date, -27), date) as Row;
  if (Number(row.runs) < 6 || !Number(row.total)) return null;
  const easy = Number(row.low) / Number(row.total);
  if (easy >= 0.8) {
    return {
      id: 'intensity-balance',
      level: 'positive',
      title: t.balance.goodTitle,
      detail: t.balance.good(Math.round(easy * 100)),
      action: null,
    };
  }
  if (easy >= 0.65) return null;
  return {
    id: 'intensity-balance',
    level: 'watch',
    title: t.balance.lowTitle,
    detail: t.balance.low(Math.round(easy * 100)),
    action: t.balance.lowAction,
  };
}

function sleepDebt(today: Day, t: T, f: F): Signal | null {
  if (today.sleep_debt_7d_h === null || today.sleep_debt_7d_h < 5) return null;
  return {
    id: 'sleep-debt',
    level: 'watch',
    title: t.sleepDebt.title,
    detail: t.sleepDebt.detail(f.number(today.sleep_debt_7d_h, 1)),
    action: t.sleepDebt.action,
  };
}

/** Going to bed at very different times each night costs sleep quality, even at the same total. */
function irregularBedtimes(nights: Day[], t: T, f: F): Signal | null {
  const bedtimes = values(nights, 'bedtime_min');
  if (bedtimes.length < 10) return null;
  const { mean, sd } = summarize(bedtimes);
  if (sd < 60) return null;
  return {
    id: 'irregular-bedtimes',
    level: 'watch',
    title: t.bedtimes.title,
    detail: t.bedtimes.detail(clockFromMinutes(mean), Math.round(sd), clockFromMinutes(Math.min(...bedtimes)), clockFromMinutes(Math.max(...bedtimes))),
    action: t.bedtimes.action,
  };
}

function stressStreak(lastThree: Day[], before: Day[], t: T, f: F): Signal | null {
  const normal = summarize(values(before, 'stress'));
  if (normal.n < 20 || lastThree.length < 3) return null;
  if (!lastThree.every((d) => d.stress !== null && d.stress > normal.mean + normal.sd)) return null;
  return {
    id: 'stress-streak',
    level: 'watch',
    title: t.stress.title,
    detail: t.stress.detail(lastThree.map((d) => f.number(d.stress)).join(', '), Math.round(normal.mean)),
    action: t.stress.action,
  };
}

/**
 * Losing weight while recovery slips is the pattern of eating too little for the training (what sports medicine calls
 * low energy availability). Each part alone is ordinary; together, for weeks, they cost health and performance.
 */
function underFuelling(threeWeeks: Day[], today: Day, t: T, f: F): Signal | null {
  const weights = threeWeeks.map((d) => d.weight_trend).filter((w): w is number => w !== null);
  if (weights.length < 15) return null;
  const change = (weights.at(-1)! - weights[0]!) / weights[0]!;
  const losing = change <= -0.015; // about 0.5% a week or faster, for three weeks
  const recoverySlipping =
    (today.hrv_7d_z !== null && today.hrv_7d_z <= -0.5) || (today.rhr_3d !== null && today.rhr_baseline !== null && today.rhr_3d - today.rhr_baseline >= 2);
  if (!(losing && recoverySlipping)) return null;
  return {
    id: 'under-fuelling',
    level: 'watch',
    title: t.fuelling.title,
    detail: t.fuelling.detail(f.percent(Math.abs(change) * 100, 1)),
    action: t.fuelling.action,
  };
}

/**
 * Body Battery drained more than it charged on most recent days, and mornings are starting lower than usual:
 * the nights aren't refilling what the days use. One such day is normal (a long run); four in five is a trend.
 */
function batteryDrain(lastFive: Day[], today: Day, history: Day[], t: T, f: F): Signal | null {
  const deficits = lastFive.filter((d) => d.charged !== null && d.drained !== null && d.drained > d.charged);
  const usual = summarize(values(history.slice(0, -5), 'body_battery'));
  if (deficits.length < 4 || today.body_battery === null || usual.n < 14 || today.body_battery > usual.mean - 8) return null;
  const net = deficits.reduce((sum, d) => sum + d.charged! - d.drained!, 0);
  return {
    id: 'battery-drain',
    level: 'watch',
    title: t.battery.title,
    detail: t.battery.detail(deficits.length, f.signed(net), today.body_battery, Math.round(usual.mean)),
    action: t.battery.action,
  };
}

function strongRecovery(today: Day, t: T): Signal | null {
  if (today.hrv_7d_z === null || today.hrv_7d_z < 0.75) return null;
  if (today.rhr_3d !== null && today.rhr_baseline !== null && today.rhr_3d > today.rhr_baseline + 1) return null;
  return {
    id: 'strong-recovery',
    level: 'positive',
    title: t.strong.title,
    detail: t.strong.detail,
    action: null,
  };
}
