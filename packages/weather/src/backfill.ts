import type { DatabaseSync } from 'node:sqlite';
import { ARCHIVE_LAG_DAYS, fetchHourly, type Fetch, type HourlyWeather } from './openmeteo.ts';

type Row = Record<string, unknown>;
const DAY = 86_400_000;
/** Polite to a free service: the first backfill fits easily (one request per place and year), later syncs need one or two. */
const MAX_REQUESTS = 40;
/** The hour used must be within this of the middle of the run. */
const MAX_GAP_MS = 90 * 60_000;

export interface WeatherSyncResult {
  added: number;
  requests: number;
  failed: number;
  /** Runs still without weather (outside the request budget, or the service had no data yet). */
  remaining: number;
}

interface Run {
  id: number;
  mid: number;
  lat: number;
  lon: number;
}

/**
 * Adds air temperature and dew point to every outdoor run that has GPS and no weather yet. Runs are grouped by place
 * (0.1°, about 10 km) and by year, so one request covers many runs. Failures are counted, never thrown: weather is
 * extra, and the sync must finish without it.
 */
export async function syncWeather(db: DatabaseSync, fetchFn: Fetch, now = Date.now()): Promise<WeatherSyncResult> {
  const runs = (
    db
      .prepare(
        `SELECT a.activity_id, a.start_time, a.duration_s,
                (SELECT lat FROM activity_records r WHERE r.activity_id = a.activity_id AND r.lat IS NOT NULL ORDER BY r.time LIMIT 1) AS lat,
                (SELECT lon FROM activity_records r WHERE r.activity_id = a.activity_id AND r.lat IS NOT NULL ORDER BY r.time LIMIT 1) AS lon
         FROM activities a
         WHERE a.type_key LIKE '%running%' AND a.type_key NOT LIKE '%treadmill%' AND a.type_key NOT LIKE '%indoor%'
           AND NOT EXISTS (SELECT 1 FROM activity_weather w WHERE w.activity_id = a.activity_id)`,
      )
      .all() as Row[]
  )
    .filter((r) => r.lat !== null && r.lon !== null)
    .map((r): Run => ({ id: Number(r.activity_id), mid: Number(r.start_time) + (Number(r.duration_s ?? 0) * 1000) / 2, lat: Number(r.lat), lon: Number(r.lon) }));

  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const recent = now - run.mid < ARCHIVE_LAG_DAYS * DAY;
    const key = `${recent ? 'forecast' : 'archive'}|${run.lat.toFixed(1)},${run.lon.toFixed(1)}|${recent ? 'recent' : new Date(run.mid).getUTCFullYear()}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }

  const insert = db.prepare(
    `INSERT OR REPLACE INTO activity_weather (activity_id, lat, lon, hour, temp_c, dew_point_c, humidity_pct, wind_kmh, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const result: WeatherSyncResult = { added: 0, requests: 0, failed: 0, remaining: 0 };
  for (const [key, group] of groups) {
    if (result.requests >= MAX_REQUESTS) {
      result.remaining += group.length;
      continue;
    }
    const source = key.startsWith('forecast') ? 'forecast' : 'archive';
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const first = Math.min(...group.map((r) => r.mid));
    const last = Math.max(...group.map((r) => r.mid));
    // One request per group, at the group's mean position: within 0.1° the weather model's 25 km cells barely differ.
    const lat = group.reduce((s, r) => s + r.lat, 0) / group.length;
    const lon = group.reduce((s, r) => s + r.lon, 0) / group.length;
    let hours: HourlyWeather[];
    result.requests++;
    try {
      hours = await fetchHourly(fetchFn, { lat, lon, start: day(first - DAY), end: day(last + DAY), source });
    } catch {
      result.failed++;
      result.remaining += group.length;
      continue;
    }
    for (const run of group) {
      const hour = nearest(hours, run.mid);
      if (!hour || hour.temp_c === null || hour.dew_point_c === null) {
        result.remaining++;
        continue;
      }
      insert.run(run.id, Math.round(run.lat * 1000) / 1000, Math.round(run.lon * 1000) / 1000, hour.time, hour.temp_c, hour.dew_point_c, hour.humidity_pct, hour.wind_kmh, source, now);
      result.added++;
    }
  }
  return result;
}

export function nearest(hours: HourlyWeather[], time: number): HourlyWeather | null {
  let best: HourlyWeather | null = null;
  for (const hour of hours) {
    // Hourly values describe the hour around the timestamp; compare with the middle of that hour.
    if (!best || Math.abs(hour.time - time) < Math.abs(best.time - time)) best = hour;
  }
  return best && Math.abs(best.time - time) <= MAX_GAP_MS ? best : null;
}
