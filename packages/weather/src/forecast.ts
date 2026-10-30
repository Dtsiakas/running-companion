import type { DatabaseSync } from 'node:sqlite';
import { heatCost, type HeatCost } from './heat.ts';
import { fetchHourly, type Fetch, type HourlyWeather } from './openmeteo.ts';

type Row = Record<string, unknown>;
const CACHE_MS = 60 * 60_000;
/** Hours worth suggesting: from 06:00 to the last full hour before 22:00. */
const FIRST_HOUR = 6;
const LAST_HOUR = 21;
const RAINY = 50;

export interface ForecastHour extends HourlyWeather {
  /** Local clock hour, 0–23. */
  local_hour: number;
  heat: HeatCost | null;
}

export interface RunWindow {
  from: string;
  to: string;
  temp_c: number;
  heat: HeatCost;
}

export interface ForecastDay {
  date: string;
  hours: ForecastHour[];
  /** The coolest dry stretch of up to three hours. */
  best: RunWindow | null;
  /** The hottest daytime hour, when it's worth avoiding (heat cost above 2%). */
  avoid: RunWindow | null;
}

export interface RunForecast {
  place: { lat: number; lon: number; name: string | null };
  fetched_at: number;
  stale: boolean;
  days: ForecastDay[];
}

/**
 * When to run today and tomorrow where you usually run (the most common start point of the last 90 days): the
 * coolest dry window and the hours to avoid. Cached for an hour; if Open-Meteo can't be reached, the last forecast
 * is returned marked stale, or null if there never was one.
 */
export async function getRunForecast(db: DatabaseSync, fetchFn: Fetch | null, now = Date.now()): Promise<RunForecast | null> {
  const home = homePlace(db, now);
  if (!home) return null;
  const zone = String((db.prepare('SELECT time_zone FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as Row | undefined)?.time_zone ?? 'UTC');
  const key = `${home.lat.toFixed(2)},${home.lon.toFixed(2)}`;
  const cached = db.prepare('SELECT hours, fetched_at FROM weather_forecast WHERE place = ?').get(key) as Row | undefined;
  let hours = cached ? (JSON.parse(String(cached.hours)) as HourlyWeather[]) : null;
  let fetchedAt = cached ? Number(cached.fetched_at) : 0;
  let stale = false;

  if ((!hours || now - fetchedAt > CACHE_MS) && fetchFn) {
    const today = localDate(now, zone);
    try {
      hours = await fetchHourly(fetchFn, { lat: home.lat, lon: home.lon, start: today, end: localDate(now + 2 * 86_400_000, zone), source: 'forecast' });
      fetchedAt = now;
      db.prepare('INSERT OR REPLACE INTO weather_forecast (place, lat, lon, hours, fetched_at) VALUES (?, ?, ?, ?, ?)').run(key, home.lat, home.lon, JSON.stringify(hours), now);
    } catch {
      stale = true;
    }
  } else if (hours && now - fetchedAt > CACHE_MS) {
    stale = true;
  }
  if (!hours) return null;
  return { place: home, fetched_at: fetchedAt, stale, days: planDays(hours, now, zone) };
}

/** Pure: today's remaining hours and tomorrow's, each with its heat cost, the best window and the hour to avoid. */
export function planDays(hours: HourlyWeather[], now: number, zone: string): ForecastDay[] {
  const today = localDate(now, zone);
  const tomorrow = localDate(now + 86_400_000, zone);
  const hourOf = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: zone });
  return [today, tomorrow].map((date) => {
    const day: ForecastHour[] = hours
      .filter((h) => localDate(h.time, zone) === date && (date !== today || h.time + 3_600_000 > now))
      .map((h) => ({ ...h, local_hour: Number(hourOf.format(new Date(h.time))), heat: h.temp_c !== null && h.dew_point_c !== null ? heatCost(h.temp_c, h.dew_point_c) : null }))
      .filter((h) => h.local_hour >= FIRST_HOUR && h.local_hour <= LAST_HOUR);
    return { date, hours: day, best: bestWindow(day), avoid: worstHour(day) };
  });
}

function bestWindow(hours: ForecastHour[]): RunWindow | null {
  const dry = hours.filter((h) => h.heat && (h.rain_pct ?? 0) < RAINY);
  if (!dry.length) return null;
  const lowest = Math.min(...dry.map((h) => h.heat!.sum_f));
  // The coolest dry hour, stretched over neighbouring dry hours that are nearly as cool, up to three hours.
  const start = dry.find((h) => h.heat!.sum_f === lowest)!;
  const index = hours.indexOf(start);
  let from = index;
  let to = index;
  const ok = (h: ForecastHour | undefined) => !!h && !!h.heat && (h.rain_pct ?? 0) < RAINY && h.heat.sum_f <= lowest + 5;
  while (to - from < 2 && (ok(hours[to + 1]) || ok(hours[from - 1]))) {
    if (ok(hours[to + 1])) to++;
    else from--;
  }
  const window = hours.slice(from, to + 1);
  const temp = Math.round(window.reduce((s, h) => s + h.temp_c!, 0) / window.length);
  return { from: clock(hours[from]!.local_hour), to: clock(hours[to]!.local_hour + 1), temp_c: temp, heat: start.heat! };
}

function worstHour(hours: ForecastHour[]): RunWindow | null {
  const hot = hours.filter((h) => h.heat).sort((a, b) => b.heat!.sum_f - a.heat!.sum_f)[0];
  if (!hot || hot.heat!.pct <= 2) return null;
  return { from: clock(hot.local_hour), to: clock(hot.local_hour + 1), temp_c: Math.round(hot.temp_c!), heat: hot.heat! };
}

/** The most common start point of the last 90 days' outdoor runs, to 0.01° (about 1 km). */
export function homePlace(db: DatabaseSync, now: number): { lat: number; lon: number; name: string | null } | null {
  const since = new Date(now - 90 * 86_400_000).toISOString().slice(0, 10);
  const row = db
    .prepare(
      `SELECT ROUND(w.lat, 2) AS lat, ROUND(w.lon, 2) AS lon, COUNT(*) AS n, MAX(a.location_name) AS name
       FROM activity_weather w JOIN activities a USING (activity_id) WHERE a.calendar_date >= ?
       GROUP BY ROUND(w.lat, 2), ROUND(w.lon, 2) ORDER BY n DESC LIMIT 1`,
    )
    .get(since) as Row | undefined;
  return row ? { lat: Number(row.lat), lon: Number(row.lon), name: row.name === null ? null : String(row.name) } : null;
}

const clock = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;
function localDate(ms: number, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone }).format(new Date(ms));
}
