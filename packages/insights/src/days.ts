import type { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/**
 * One row per day with everything the insights read, joined once. Which night or day each value belongs to:
 * - sleep, HRV, breathing, SpO2, Body Battery (peak): the night that ended on `date`;
 * - load, stress, steps: the day `date` itself (so their effect shows in the next row's night).
 */
export interface Day {
  date: string;
  load: number | null;
  form: number | null;
  acwr: number | null;
  hrv: number | null;
  hrv_7d_z: number | null;
  rhr: number | null;
  rhr_3d: number | null;
  rhr_baseline: number | null;
  sleep_h: number | null;
  sleep_debt_7d_h: number | null;
  sleep_score: number | null;
  /** Minutes from midnight, local time: 23:30 is −30, 00:45 is 45. */
  bedtime_min: number | null;
  breathing: number | null;
  spo2: number | null;
  body_battery: number | null;
  /** Body Battery charged by the night's sleep (Garmin's sleep event). */
  recharge: number | null;
  /** Body Battery charged and drained over the whole day. */
  charged: number | null;
  drained: number | null;
  stress: number | null;
  weight_trend: number | null;
}

export function loadDays(db: DatabaseSync, from: string, to: string): Day[] {
  const zone = (db.prepare('SELECT time_zone FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as Row | undefined)?.time_zone;
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone ? String(zone) : undefined });
  const rows = db
    .prepare(
      `SELECT d.calendar_date, d.load, d.form, d.acwr, d.hrv_ms, d.hrv_z, d.rhr, d.rhr_3d, d.rhr_baseline, d.sleep_h, d.sleep_debt_7d_h, d.weight_trend_kg,
              s.score, s.start_time, s.avg_respiration, s.avg_spo2_pct, w.body_battery_max, w.bb_sleep, w.body_battery_charged, w.body_battery_drained, w.stress_avg
       FROM daily_metrics d
       LEFT JOIN sleep s ON s.calendar_date = d.calendar_date
       LEFT JOIN daily_wellness w ON w.calendar_date = d.calendar_date
       WHERE d.calendar_date BETWEEN ? AND ?
       ORDER BY d.calendar_date`,
    )
    .all(from, to) as Row[];

  return rows.map((row) => {
    let bedtime: number | null = null;
    if (row.start_time !== null && row.start_time !== undefined) {
      const [h, m] = clock.format(new Date(Number(row.start_time))).split(':').map(Number) as [number, number];
      const minutes = h * 60 + m;
      // Evening times count back from midnight, early-morning times forward: bedtimes stay on one continuous scale.
      bedtime = minutes >= 12 * 60 ? minutes - 24 * 60 : minutes;
    }
    return {
      date: String(row.calendar_date),
      load: n(row.load),
      form: n(row.form),
      acwr: n(row.acwr),
      hrv: n(row.hrv_ms),
      hrv_7d_z: n(row.hrv_z),
      rhr: n(row.rhr),
      rhr_3d: n(row.rhr_3d),
      rhr_baseline: n(row.rhr_baseline),
      sleep_h: n(row.sleep_h),
      sleep_debt_7d_h: n(row.sleep_debt_7d_h),
      sleep_score: n(row.score),
      bedtime_min: bedtime,
      breathing: n(row.avg_respiration),
      spo2: n(row.avg_spo2_pct),
      body_battery: n(row.body_battery_max),
      recharge: n(row.bb_sleep),
      charged: n(row.body_battery_charged),
      drained: n(row.body_battery_drained),
      stress: n(row.stress_avg),
      weight_trend: n(row.weight_trend_kg),
    };
  });
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "23:30", "00:45" from minutes relative to midnight. */
export function clockFromMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
