import type { DatabaseSync } from 'node:sqlite';
import { addDays } from './days.ts';

type Row = Record<string, unknown>;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const round = (value: number, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;
const mean = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

export interface BatteryDay {
  date: string;
  charged: number | null;
  drained: number | null;
  /** The day's highest level, usually just after waking. */
  morning: number | null;
  stress: number | null;
  /** Awake minutes at each stress level (rest and sleep excluded). */
  low_min: number | null;
  medium_min: number | null;
  high_min: number | null;
}

/**
 * Stress and Body Battery in depth: whether the nights refill what the days use, what charges and drains it, how
 * much of the day is spent stressed, and whether workdays differ from weekends. Today is left out of the averages
 * because it's still running.
 */
export function getStressReport(db: DatabaseSync, date: string) {
  const rows = db
    .prepare(
      `SELECT calendar_date, body_battery_charged, body_battery_drained, body_battery_max, stress_avg, low_stress_s, medium_stress_s, high_stress_s,
              bb_sleep, bb_nap, bb_activity, bb_stress, bb_recovery
       FROM daily_wellness WHERE calendar_date BETWEEN ? AND ? ORDER BY calendar_date`,
    )
    .all(addDays(date, -83), date) as Row[];
  const minutes = (value: unknown) => (value === null || value === undefined ? null : Math.round(Number(value) / 60));
  const days: BatteryDay[] = rows.map((r) => ({
    date: String(r.calendar_date),
    charged: n(r.body_battery_charged),
    drained: n(r.body_battery_drained),
    morning: n(r.body_battery_max),
    stress: n(r.stress_avg),
    low_min: minutes(r.low_stress_s),
    medium_min: minutes(r.medium_stress_s),
    high_min: minutes(r.high_stress_s),
  }));
  const complete = rows.filter((r) => String(r.calendar_date) < date);
  const lastFour = complete.filter((r) => String(r.calendar_date) >= addDays(date, -28));
  const pick = (list: Row[], key: string) => list.map((r) => r[key]).filter((v) => v !== null && v !== undefined).map(Number);

  return {
    date,
    days: days.filter((d) => d.date >= addDays(date, -27)),
    balance: balance(days.filter((d) => d.date < date && d.date >= addDays(date, -14)), days.filter((d) => d.date < addDays(date, -14))),
    sources: sources(lastFour, pick),
    stress_time: stressTime(days.filter((d) => d.date < date && d.date >= addDays(date, -14)), days.filter((d) => d.date < addDays(date, -14))),
    week_pattern: weekPattern(days.filter((d) => d.date < date && d.date >= addDays(date, -56))),
  };
}

export type StressReport = ReturnType<typeof getStressReport>;

/** Charged against drained over two weeks, and this fortnight's mornings against the ten weeks before. */
function balance(recent: BatteryDay[], before: BatteryDay[]) {
  const both = recent.filter((d) => d.charged !== null && d.drained !== null);
  if (both.length < 7) return null;
  const charged = mean(both.map((d) => d.charged!))!;
  const drained = mean(both.map((d) => d.drained!))!;
  const morning = mean(recent.map((d) => d.morning).filter((v): v is number => v !== null));
  const usualMorning = mean(before.map((d) => d.morning).filter((v): v is number => v !== null));
  const net = charged - drained;
  return {
    days: both.length,
    charged_avg: round(charged),
    drained_avg: round(drained),
    net_avg: round(net),
    deficit_days: both.filter((d) => d.drained! > d.charged!).length,
    morning_avg: morning === null ? null : round(morning),
    usual_morning: usualMorning === null ? null : round(usualMorning),
    verdict: net <= -5 ? ('draining' as const) : net >= 5 ? ('building' as const) : ('even' as const),
  };
}

/**
 * Where the battery goes, per day on average over four weeks. Garmin tags part of the charge and drain to events
 * (sleep, naps, workouts, stressful spells, restful spells); the rest is the steady drain of being awake and the
 * small recharges of sitting still, shown as "everyday".
 */
function sources(days: Row[], pick: (list: Row[], key: string) => number[]) {
  const usable = days.filter((r) => r.bb_sleep !== null && r.body_battery_charged !== null && r.body_battery_drained !== null);
  if (usable.length < 7) return null;
  const perDay = (key: string) => round(pick(usable, key).reduce((sum, v) => sum + v, 0) / usable.length);
  const sleep = perDay('bb_sleep');
  const nap = perDay('bb_nap');
  const activity = perDay('bb_activity');
  const stress = perDay('bb_stress');
  const recovery = perDay('bb_recovery');
  const charged = perDay('body_battery_charged');
  const drained = perDay('body_battery_drained');
  const tagged = [nap, activity, stress, recovery];
  const taggedCharge = sleep + tagged.filter((v) => v > 0).reduce((sum, v) => sum + v, 0);
  const taggedDrain = -tagged.filter((v) => v < 0).reduce((sum, v) => sum + v, 0);
  return {
    days: usable.length,
    charged,
    drained,
    sleep,
    nap,
    workouts: activity,
    stress,
    recovery,
    everyday_charge: Math.max(0, charged - taggedCharge),
    everyday_drain: Math.max(0, drained - taggedDrain),
  };
}

/** Awake minutes at each stress level: the last two weeks against the ten before. */
function stressTime(recent: BatteryDay[], before: BatteryDay[]) {
  const avg = (list: BatteryDay[], key: 'low_min' | 'medium_min' | 'high_min' | 'stress') => {
    const values = list.map((d) => d[key]).filter((v): v is number => v !== null);
    return values.length >= 5 ? round(mean(values)!) : null;
  };
  if (avg(recent, 'stress') === null) return null;
  return {
    recent: { stress: avg(recent, 'stress'), low_min: avg(recent, 'low_min'), medium_min: avg(recent, 'medium_min'), high_min: avg(recent, 'high_min') },
    before: { stress: avg(before, 'stress'), low_min: avg(before, 'low_min'), medium_min: avg(before, 'medium_min'), high_min: avg(before, 'high_min') },
  };
}

/** Workdays (Monday to Friday) against weekends over eight weeks. */
function weekPattern(days: BatteryDay[]) {
  const isWeekend = (d: BatteryDay) => [0, 6].includes(new Date(`${d.date}T12:00:00Z`).getUTCDay());
  const group = (list: BatteryDay[]) => {
    const stress = list.map((d) => d.stress).filter((v): v is number => v !== null);
    const stressed = list.map((d) => (d.medium_min ?? 0) + (d.high_min ?? 0));
    const drained = list.map((d) => d.drained).filter((v): v is number => v !== null);
    return { days: stress.length, stress: stress.length ? round(mean(stress)!) : null, stressed_min: stressed.length ? round(mean(stressed)!) : null, drained: drained.length ? round(mean(drained)!) : null };
  };
  const workdays = group(days.filter((d) => !isWeekend(d)));
  const weekends = group(days.filter(isWeekend));
  if (workdays.days < 10 || weekends.days < 4) return null;
  return { workdays, weekends };
}
