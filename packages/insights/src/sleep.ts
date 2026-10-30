import type { DatabaseSync } from 'node:sqlite';
import { addDays, clockFromMinutes } from './days.ts';
import { percentile, summarize } from './stats.ts';

type Row = Record<string, unknown>;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Garmin's own ideal ranges for each stage, as a share of the night (sent with every sleep score). */
export const STAGE_IDEAL = { deep: [16, 33], rem: [21, 31], light: [30, 64] } as const;
/** Time to fall asleep after lights out: 10–20 minutes is typical for a healthy adult. */
const SETTLE_MIN = 15;
/** Shift bedtime by this much at a time: bigger jumps rarely stick, because the body clock moves slowly. */
const STEP_MIN = 30;
const FALLBACK_NEED_MIN = 480;

export interface Night {
  /** The date the night ended on (Garmin's convention). */
  date: string;
  /** Minutes from midnight: bedtime counts back for the evening (23:30 is −30), wake counts forward. */
  bed_min: number;
  wake_min: number;
  bed: string;
  wake: string;
  hours: number;
  need_h: number | null;
  score: number | null;
  /** Ended on Saturday or Sunday: a free morning. */
  weekend: boolean;
}

/**
 * Sleep in depth: tonight's suggested bedtime, sleep debt against Garmin's nightly need, how regular the timing is,
 * and the stage mix. Everything is about the nights that ended on or before `date`.
 */
export function getSleepReport(db: DatabaseSync, date: string) {
  const nights = loadNights(db, addDays(date, -27), date);
  const recent = nights.filter((night) => night.date > addDays(date, -14));
  return {
    date,
    nights,
    tonight: tonight(db, date, nights),
    // The last seven recorded nights: before you've slept, today's night isn't in yet, and "the last week" shouldn't shrink to six.
    debt: debt(nights.slice(-7).filter((night) => night.date > addDays(date, -9))),
    consistency: consistency(recent, nights),
    stages: stages(db, date),
  };
}

export type SleepReport = ReturnType<typeof getSleepReport>;

function loadNights(db: DatabaseSync, from: string, to: string): Night[] {
  const zone = (db.prepare('SELECT time_zone FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as Row | undefined)?.time_zone;
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone ? String(zone) : undefined });
  const minutes = (ms: number) => {
    const [h, m] = clock.format(new Date(ms)).split(':').map(Number) as [number, number];
    return h * 60 + m;
  };
  const rows = db
    .prepare('SELECT calendar_date, start_time, end_time, sleep_s, need_actual_min, score FROM sleep WHERE calendar_date BETWEEN ? AND ? AND start_time IS NOT NULL AND end_time IS NOT NULL AND sleep_s > 0 ORDER BY calendar_date')
    .all(from, to) as Row[];
  return rows.map((row) => {
    const bedClock = minutes(Number(row.start_time));
    const bed = bedClock >= 12 * 60 ? bedClock - 24 * 60 : bedClock;
    const wake = minutes(Number(row.end_time));
    const weekday = new Date(`${String(row.calendar_date)}T12:00:00Z`).getUTCDay();
    return {
      date: String(row.calendar_date),
      bed_min: bed,
      wake_min: wake,
      bed: clockFromMinutes(bed),
      wake: clockFromMinutes(wake),
      hours: round(Number(row.sleep_s) / 3600),
      need_h: row.need_actual_min === null ? null : round(Number(row.need_actual_min) / 60),
      score: n(row.score),
      weekend: weekday === 0 || weekday === 6,
    };
  });
}

/**
 * When to be asleep tonight to meet Garmin's sleep need before your usual wake-up time for tomorrow's kind of day
 * (weekday or weekend). If that is far earlier than you actually fall asleep, the realistic step is 30 minutes
 * earlier than usual, not the full jump: the body clock moves about that much in a few days.
 */
function tonight(db: DatabaseSync, date: string, nights: Night[]) {
  const last = db.prepare('SELECT next_need_min, need_actual_min FROM sleep WHERE calendar_date <= ? ORDER BY calendar_date DESC LIMIT 1').get(date) as Row | undefined;
  const needMin = n(last?.next_need_min) ?? n(last?.need_actual_min) ?? FALLBACK_NEED_MIN;
  const needSource = n(last?.next_need_min) !== null ? 'garmin' : n(last?.need_actual_min) !== null ? 'garmin_last_night' : 'default';

  // The next night to sleep ends today if today's night isn't recorded yet (it's past midnight and you're still up),
  // otherwise tomorrow. Its wake-up is the one to plan for.
  const lastNight = nights.at(-1)?.date;
  const wakeDay = lastNight !== undefined && lastNight < date ? date : addDays(date, 1);
  const wakeWeekend = [0, 6].includes(new Date(`${wakeDay}T12:00:00Z`).getUTCDay());
  const sameKind = nights.filter((night) => night.weekend === wakeWeekend);
  const basis = sameKind.length >= 4 ? sameKind : nights;
  if (basis.length < 4) return null;

  const wake = percentile(basis.map((night) => night.wake_min), 0.5);
  const usualBed = percentile(nights.slice(-14).map((night) => night.bed_min), 0.5);
  const asleepBy = wake - needMin;
  const gap = usualBed - asleepBy;
  // Within half an hour of what you already do: just aim for the target. Further: one step earlier than usual.
  const step = gap > STEP_MIN ? usualBed - STEP_MIN : null;

  return {
    need_h: round(needMin / 60, 2),
    need_source: needSource,
    wake: clockFromMinutes(wake),
    wake_basis: basis === sameKind ? (wakeWeekend ? 'weekend' : 'weekday') : 'all',
    asleep_by: clockFromMinutes(asleepBy),
    in_bed_by: clockFromMinutes(asleepBy - SETTLE_MIN),
    usual_bed: clockFromMinutes(usualBed),
    /** How much later than the target you usually fall asleep (minutes; negative means earlier). */
    gap_min: Math.round(gap),
    /** A realistic first step when the target is far off; null when the target itself is within reach. */
    step: step === null ? null : { asleep_by: clockFromMinutes(step), in_bed_by: clockFromMinutes(step - SETTLE_MIN), hours: round((wake - step) / 60) },
    settle_min: SETTLE_MIN,
    /** The morning this plan wakes up on. */
    wake_day: wakeDay,
  };
}

/** The last seven nights against Garmin's need for each night. Debt is what's missing; extra sleep doesn't bank. */
function debt(week: Night[]) {
  if (week.length < 4) return null;
  const rows = week.map((night) => ({ date: night.date, slept_h: night.hours, need_h: night.need_h ?? FALLBACK_NEED_MIN / 60 }));
  const slept = rows.reduce((sum, r) => sum + r.slept_h, 0);
  const needed = rows.reduce((sum, r) => sum + r.need_h, 0);
  const short = rows.reduce((sum, r) => sum + Math.max(0, r.need_h - r.slept_h), 0);
  return {
    nights: rows.length,
    slept_avg_h: round(slept / rows.length),
    need_avg_h: round(needed / rows.length),
    debt_h: round(short),
    short_nights: rows.filter((r) => r.slept_h < r.need_h - 0.5).length,
    level: short >= 7 ? ('high' as const) : short >= 3.5 ? ('some' as const) : ('low' as const),
  };
}

/**
 * How regular the timing is. Day-to-day spread (standard deviation) of bedtime and wake-up over two weeks, and the
 * shift between weekday and weekend nights ("social jetlag": the body clock living in another time zone at weekends).
 * Regular timing is linked to better sleep quality and daytime alertness, independent of how long you sleep.
 */
function consistency(recent: Night[], month: Night[]) {
  if (recent.length < 7) return null;
  const bed = summarize(recent.map((night) => night.bed_min));
  const wake = summarize(recent.map((night) => night.wake_min));
  const rate = (sd: number) => (sd < 30 ? ('regular' as const) : sd < 60 ? ('variable' as const) : ('irregular' as const));
  const mid = (nights: Night[]) => (nights.length >= 3 ? percentile(nights.map((night) => (night.bed_min + night.wake_min) / 2), 0.5) : null);
  const weekdayMid = mid(month.filter((night) => !night.weekend));
  const weekendMid = mid(month.filter((night) => night.weekend));
  return {
    nights: recent.length,
    bed_sd_min: Math.round(bed.sd),
    wake_sd_min: Math.round(wake.sd),
    bed_rating: rate(bed.sd),
    wake_rating: rate(wake.sd),
    earliest_bed: clockFromMinutes(Math.min(...recent.map((night) => night.bed_min))),
    latest_bed: clockFromMinutes(Math.max(...recent.map((night) => night.bed_min))),
    weekday_mid: weekdayMid === null ? null : clockFromMinutes(weekdayMid),
    weekend_mid: weekendMid === null ? null : clockFromMinutes(weekendMid),
    social_jetlag_min: weekdayMid === null || weekendMid === null ? null : Math.round(weekendMid - weekdayMid),
  };
}

/** Average stage mix over the last two weeks against Garmin's ideal ranges. */
function stages(db: DatabaseSync, date: string) {
  const rows = db.prepare('SELECT deep_pct, rem_pct, light_pct, sleep_s FROM sleep WHERE calendar_date BETWEEN ? AND ? AND deep_pct IS NOT NULL').all(addDays(date, -13), date) as Row[];
  if (rows.length < 5) return null;
  const avg = (key: string) => Math.round(rows.reduce((sum, r) => sum + Number(r[key]), 0) / rows.length);
  const deep = avg('deep_pct');
  const rem = avg('rem_pct');
  const light = avg('light_pct');
  const status = (value: number, [low, high]: readonly [number, number]) => (value < low ? ('low' as const) : value > high ? ('high' as const) : ('in_range' as const));
  return {
    nights: rows.length,
    deep: { pct: deep, ideal: STAGE_IDEAL.deep, status: status(deep, STAGE_IDEAL.deep) },
    rem: { pct: rem, ideal: STAGE_IDEAL.rem, status: status(rem, STAGE_IDEAL.rem) },
    light: { pct: light, ideal: STAGE_IDEAL.light, status: status(light, STAGE_IDEAL.light) },
  };
}
