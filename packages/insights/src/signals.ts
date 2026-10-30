import type { DatabaseSync } from 'node:sqlite';
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
export function getSignals(db: DatabaseSync, date: string): Signal[] {
  const days = loadDays(db, addDays(date, -BASELINE_DAYS), date);
  const today = days.at(-1);
  if (!today || today.date !== date) return [];
  const history = days.slice(0, -1);
  const signals = [
    illnessWatch(today, history),
    overreaching(days.slice(-7), today),
    loadSpike(today),
    longRunJump(db, date),
    easyRunDrift(db, date),
    intensityBalance(db, date),
    sleepDebt(today),
    irregularBedtimes(days.slice(-14)),
    // Today's stress covers only part of the day, so the streak is judged on the three complete days before it.
    stressStreak(history.slice(-3), history.slice(0, -3)),
    underFuelling(days.slice(-22), today),
    // Today's charge and drain are still running, so judge the five complete days before it.
    batteryDrain(history.slice(-5), today, history),
    strongRecovery(today),
  ].filter((s): s is Signal => s !== null);
  const order = { warning: 0, watch: 1, positive: 2 };
  return signals.sort((a, b) => order[a.level] - order[b.level]);
}

const values = (days: Day[], key: keyof Day) => days.map((d) => d[key]).filter((v): v is number => typeof v === 'number');
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * The classic early sign of illness is several systems shifting at once: resting heart rate up, HRV down and
 * breathing rate up during sleep. Any one alone is ordinary day-to-day noise; two or three together are not.
 */
function illnessWatch(today: Day, history: Day[]): Signal | null {
  const markers: string[] = [];
  const rhr = summarize(values(history, 'rhr'));
  if (today.rhr !== null && rhr.n >= 20 && today.rhr - rhr.mean >= 3) markers.push(`resting heart rate ${today.rhr} bpm, ${round(today.rhr - rhr.mean)} above your normal`);
  const hrv = summarize(values(history, 'hrv').map(Math.log));
  if (today.hrv !== null && hrv.n >= 20 && (Math.log(today.hrv) - hrv.mean) / hrv.sd <= -1.5)
    markers.push(`HRV ${Math.round(today.hrv)} ms, well below your normal of ${Math.round(Math.exp(hrv.mean))}`);
  const breathing = summarize(values(history, 'breathing'));
  if (today.breathing !== null && breathing.n >= 20 && today.breathing - breathing.mean >= 1)
    markers.push(`breathing rate ${today.breathing}/min overnight, ${round(today.breathing - breathing.mean)} above your normal`);
  if (markers.length < 2) return null;
  const strong = markers.length >= 3;
  return {
    id: 'illness-watch',
    level: strong ? 'warning' : 'watch',
    title: strong ? 'Your body may be fighting something' : 'Signs your body is under strain',
    detail: `Last night: ${markers.join('; ')}. When these move together, it often comes a day or two before feeling sick, though hard training, alcohol or a bad night can do it too.`,
    action: 'Keep today easy or rest, sleep and drink well, and skip intensity if you feel off. This is a pattern in your data, not a diagnosis: see a doctor if you feel unwell for more than a few days.',
  };
}

/** Form deep in the negative for most of a week is normal in a build; with recovery also slipping, it's too much. */
function overreaching(week: Day[], today: Day): Signal | null {
  const deepDays = week.filter((d) => d.form !== null && d.form <= -25).length;
  if (deepDays < 5) return null;
  const hrvDown = today.hrv_7d_z !== null && today.hrv_7d_z <= -0.75;
  const rhrUp = today.rhr_3d !== null && today.rhr_baseline !== null && today.rhr_3d - today.rhr_baseline >= 2;
  if (!hrvDown && !rhrUp) return null;
  return {
    id: 'overreaching',
    level: 'warning',
    title: 'Fatigue is building faster than you recover',
    detail: `Form has been −25 or lower on ${deepDays} of the last 7 days, and ${[hrvDown ? 'your 7-day HRV is below normal' : null, rhrUp ? `resting heart rate is ${round(today.rhr_3d! - today.rhr_baseline!)} bpm above normal` : null].filter(Boolean).join(' and ')}. Heavy training is fine while recovery keeps up; here it isn't.`,
    action: 'Ease off for a few days: keep runs easy and short, or follow Garmin’s plan but skip anything extra. It usually turns around within 3–5 easier days.',
  };
}

function loadSpike(today: Day): Signal | null {
  if (today.acwr === null || today.acwr < 1.3) return null;
  const spike = today.acwr >= 1.5;
  return {
    id: 'load-spike',
    level: spike ? 'warning' : 'watch',
    title: spike ? 'Training load jumped' : 'Training load is building quickly',
    detail: `This week’s load is ${round(today.acwr, 2)}× your average week of the last four. ${spike ? 'Above 1.5× is the range most linked to overuse injuries.' : 'Fine for a while, as long as recovery keeps up.'}`,
    action: spike ? 'Hold volume steady for a week instead of adding more, and keep the easy runs truly easy.' : null,
  };
}

/** A long run much longer than anything recently is a common way into calf, shin and Achilles trouble. */
function longRunJump(db: DatabaseSync, date: string): Signal | null {
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
    title: 'A big step up in long-run distance',
    detail: `Your longest run this week was ${round(recent)} km, ${Math.round((recent / before - 1) * 100)}% longer than anything in the four weeks before (${round(before)} km). Tendons adapt more slowly than heart and lungs.`,
    action: 'Watch for calf, shin or Achilles soreness in the next days, and keep the next long run at this distance until it feels routine.',
  };
}

/** Easy runs that drift above your first threshold stop being easy: more fatigue for little extra fitness. */
function easyRunDrift(db: DatabaseSync, date: string): Signal | null {
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
    title: 'Easy runs aren’t staying easy',
    detail: `${drifted.length} of your last ${runs.length} easy runs spent more than a quarter of the time above your first threshold (about ${Math.round(runs.map(share).reduce((a, b) => a + b, 0) / runs.length * 100)}% on average).${hot ? ' It has been warm, and heat alone pushes heart rate up.' : ''}`,
    action: 'Slow the easy runs down until heart rate stays under your first threshold most of the time, even if the pace feels too slow. That’s where most endurance comes from.',
  };
}

/** The share of running time below the first threshold over four weeks: most endurance progress comes from a big easy share. */
function intensityBalance(db: DatabaseSync, date: string): Signal | null {
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
      title: 'Well-balanced training',
      detail: `${Math.round(easy * 100)}% of your running time in the last four weeks was easy. That’s the balance endurance programmes aim for.`,
      action: null,
    };
  }
  if (easy >= 0.65) return null;
  return {
    id: 'intensity-balance',
    level: 'watch',
    title: 'Little easy running lately',
    detail: `Only ${Math.round(easy * 100)}% of your running time in the last four weeks was easy, below the 70–80% that endurance progress usually rests on. Much of the rest sits in the moderate zone, which tires you without the benefit of truly hard sessions.`,
    action: 'Keep Garmin’s hard sessions hard and make everything else slower.',
  };
}

function sleepDebt(today: Day): Signal | null {
  if (today.sleep_debt_7d_h === null || today.sleep_debt_7d_h < 5) return null;
  return {
    id: 'sleep-debt',
    level: 'watch',
    title: 'Sleep debt is adding up',
    detail: `Over the last 7 nights you slept ${round(today.sleep_debt_7d_h)} hours less than Garmin estimated you needed. Recovery, mood and how hard runs feel all suffer from it.`,
    action: 'An earlier night or two clears it faster than sleeping in.',
  };
}

/** Going to bed at very different times each night costs sleep quality, even at the same total. */
function irregularBedtimes(nights: Day[]): Signal | null {
  const bedtimes = values(nights, 'bedtime_min');
  if (bedtimes.length < 10) return null;
  const { mean, sd } = summarize(bedtimes);
  if (sd < 60) return null;
  return {
    id: 'irregular-bedtimes',
    level: 'watch',
    title: 'Bedtimes vary a lot',
    detail: `Over the last two weeks your bedtime averaged ${clockFromMinutes(mean)} but typically varied by ${Math.round(sd)} minutes either way (from ${clockFromMinutes(Math.min(...bedtimes))} to ${clockFromMinutes(Math.max(...bedtimes))}). A steadier bedtime usually improves deep sleep and HRV.`,
    action: 'Pick a bedtime you can keep on most nights, especially before hard sessions.',
  };
}

function stressStreak(lastThree: Day[], before: Day[]): Signal | null {
  const normal = summarize(values(before, 'stress'));
  if (normal.n < 20 || lastThree.length < 3) return null;
  if (!lastThree.every((d) => d.stress !== null && d.stress > normal.mean + normal.sd)) return null;
  return {
    id: 'stress-streak',
    level: 'watch',
    title: 'Stress has been high for days',
    detail: `All-day stress was above your normal range on each of the last three days (${lastThree.map((d) => d.stress).join(', ')}; a typical day for you is ${Math.round(normal.mean)}). Garmin’s stress rises with work and life stress, but also with illness, heat, caffeine and alcohol.`,
    action: 'If it’s life rather than training, an easy run or a walk often helps more than a hard session.',
  };
}

/**
 * Losing weight while recovery slips is the pattern of eating too little for the training (what sports medicine calls
 * low energy availability). Each part alone is ordinary; together, for weeks, they cost health and performance.
 */
function underFuelling(threeWeeks: Day[], today: Day): Signal | null {
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
    title: 'Weight is dropping while recovery slips',
    detail: `Your weight trend is down ${Math.round(Math.abs(change) * 1000) / 10}% in three weeks, while HRV or resting heart rate has moved the wrong way. That combination often means eating too little for the training.`,
    action: 'Eat more around training, mostly carbohydrate on the hard and long days (see Body for your ranges). If it keeps happening, a sports dietitian can help.',
  };
}

/**
 * Body Battery drained more than it charged on most recent days, and mornings are starting lower than usual:
 * the nights aren't refilling what the days use. One such day is normal (a long run); four in five is a trend.
 */
function batteryDrain(lastFive: Day[], today: Day, history: Day[]): Signal | null {
  const deficits = lastFive.filter((d) => d.charged !== null && d.drained !== null && d.drained > d.charged);
  const usual = summarize(values(history.slice(0, -5), 'body_battery'));
  if (deficits.length < 4 || today.body_battery === null || usual.n < 14 || today.body_battery > usual.mean - 8) return null;
  const net = deficits.reduce((sum, d) => sum + d.charged! - d.drained!, 0);
  return {
    id: 'battery-drain',
    level: 'watch',
    title: 'Running down',
    detail: `Body Battery drained more than it charged on ${deficits.length} of the last 5 days (${net} in total), and this morning started at ${today.body_battery} against your usual ${Math.round(usual.mean)}.`,
    action: 'The fix is usually on the charging side: an earlier night or two, and a calm hour before bed. Easy runs only until mornings are back near normal.',
  };
}

function strongRecovery(today: Day): Signal | null {
  if (today.hrv_7d_z === null || today.hrv_7d_z < 0.75) return null;
  if (today.rhr_3d !== null && today.rhr_baseline !== null && today.rhr_3d > today.rhr_baseline + 1) return null;
  return {
    id: 'strong-recovery',
    level: 'positive',
    title: 'Recovery is strong',
    detail: 'Your 7-day HRV is clearly above your normal and resting heart rate is at or below it: your body is absorbing the training well.',
    action: null,
  };
}
