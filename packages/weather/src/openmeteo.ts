/**
 * Open-Meteo: free, no key, and the archive goes back decades (ERA5 reanalysis, about 25 km resolution, published
 * with a delay of about five days). Recent days and the coming days come from the forecast endpoint instead.
 * Times are requested as Unix seconds (UTC) so there's no time-zone guessing.
 */
export interface HourlyWeather {
  /** Start of the hour, epoch milliseconds (UTC). */
  time: number;
  temp_c: number | null;
  dew_point_c: number | null;
  humidity_pct: number | null;
  wind_kmh: number | null;
  /** Forecast only. */
  rain_pct: number | null;
}

export type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const VARIABLES = ['temperature_2m', 'dew_point_2m', 'relative_humidity_2m', 'wind_speed_10m'];

/** Days the archive lags behind; runs more recent than this are looked up in the forecast endpoint's past days. */
export const ARCHIVE_LAG_DAYS = 6;

export class WeatherError extends Error {}

export async function fetchHourly(
  fetchFn: Fetch,
  options: { lat: number; lon: number; start: string; end: string; source: 'archive' | 'forecast' },
): Promise<HourlyWeather[]> {
  const params = new URLSearchParams({
    latitude: options.lat.toFixed(3),
    longitude: options.lon.toFixed(3),
    start_date: options.start,
    end_date: options.end,
    hourly: (options.source === 'forecast' ? [...VARIABLES, 'precipitation_probability'] : VARIABLES).join(','),
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
  });
  const url = `${options.source === 'archive' ? ARCHIVE : FORECAST}?${params}`;
  const response = await fetchFn(url, { headers: { 'User-Agent': 'running-companion (personal use)' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new WeatherError(`Open-Meteo answered ${response.status} for ${options.source} ${options.start}..${options.end}`);
  return parseHourly(await response.json());
}

/** Open-Meteo returns parallel arrays under `hourly`; turn them into one object per hour. */
export function parseHourly(body: unknown): HourlyWeather[] {
  const hourly = (body as { hourly?: Record<string, unknown[]> } | null)?.hourly;
  if (!hourly || !Array.isArray(hourly.time)) throw new WeatherError('Open-Meteo response without hourly data');
  const column = (name: string) => (Array.isArray(hourly[name]) ? (hourly[name] as unknown[]) : []);
  const value = (list: unknown[], i: number) => (typeof list[i] === 'number' ? (list[i] as number) : null);
  const temp = column('temperature_2m');
  const dew = column('dew_point_2m');
  const humidity = column('relative_humidity_2m');
  const wind = column('wind_speed_10m');
  const rain = column('precipitation_probability');
  return hourly.time.map((t, i) => ({
    time: Number(t) * 1000,
    temp_c: value(temp, i),
    dew_point_c: value(dew, i),
    humidity_pct: value(humidity, i),
    wind_kmh: value(wind, i),
    rain_pct: value(rain, i),
  }));
}
