import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { coolEquivalentPace, getRunForecast, heatCost, parseHourly, planDays, syncWeather, type Fetch } from '@companion/weather';

const HOUR = 3_600_000;

test('heat cost: cool and dry costs nothing; warm and humid costs a few percent; very hot is flagged', () => {
  assert.deepEqual(heatCost(10, 5), { sum_f: 91, pct: 0, level: 'none', label: 'Ideal running weather' });
  const warm = heatCost(27, 18); // 80.6 + 64.4 = 145 °F: the 141–150 band, 3–4.5%
  assert.equal(warm.sum_f, 145);
  assert.equal(warm.level, 'moderate');
  assert.ok(warm.pct > 3 && warm.pct < 4.5);
  assert.equal(heatCost(38, 28).level, 'extreme');
});

test('cool-weather pace: 5:30/km at a 3% cost is about 5:20/km', () => {
  assert.equal(Math.round(coolEquivalentPace(330, 3)), 320);
});

test('Open-Meteo hourly arrays become one object per hour, with missing values as null', () => {
  const hours = parseHourly({ hourly: { time: [1793232000, 1793235600], temperature_2m: [18.2, null], dew_point_2m: [12.1, 11.9], relative_humidity_2m: [68, 70], wind_speed_10m: [9.4, 8] } });
  assert.equal(hours.length, 2);
  assert.equal(hours[0]!.time, 1793232000 * 1000);
  assert.equal(hours[0]!.temp_c, 18.2);
  assert.equal(hours[1]!.temp_c, null);
  assert.equal(hours[0]!.rain_pct, null);
  assert.throws(() => parseHourly({ error: true, reason: 'bad' }));
});

/** A fake Open-Meteo: every hour in the requested range at 20 °C, dew point 10 °C. Records each URL. */
function fakeOpenMeteo(urls: string[], fail = false): Fetch {
  return async (url) => {
    urls.push(url);
    if (fail) return { ok: false, status: 503, json: async () => ({}) };
    const params = new URL(url).searchParams;
    const start = Date.parse(`${params.get('start_date')}T00:00:00Z`);
    const end = Date.parse(`${params.get('end_date')}T23:00:00Z`);
    const time: number[] = [];
    for (let t = start; t <= end; t += HOUR) time.push(t / 1000);
    return { ok: true, status: 200, json: async () => ({ hourly: { time, temperature_2m: time.map(() => 20), dew_point_2m: time.map(() => 10), relative_humidity_2m: time.map(() => 52), wind_speed_10m: time.map(() => 7), precipitation_probability: time.map(() => 0) } }) };
  };
}

function seedRuns() {
  const db = openDatabase(':memory:');
  upsert(db, 'profile_snapshots', ['calendar_date'], { calendar_date: '2025-01-01', time_zone: 'Europe/Athens', updated_at: 0 });
  const runs = [
    { id: 1, start: Date.UTC(2025, 5, 10, 6), lat: 45.0, lon: 10.0 },
    { id: 2, start: Date.UTC(2025, 6, 2, 17), lat: 45.001, lon: 10.001 },
    { id: 3, start: Date.UTC(2026, 9, 1, 6), lat: 45.0, lon: 10.0 }, // another year: its own request
    { id: 4, start: Date.UTC(2026, 9, 28, 16), lat: 46.2, lon: 11.3 }, // recent and elsewhere: the forecast endpoint
  ];
  for (const r of runs) {
    upsert(db, 'activities', ['activity_id'], { activity_id: r.id, type_key: 'running', start_time: r.start, start_time_local: new Date(r.start).toISOString().slice(0, 19), calendar_date: new Date(r.start).toISOString().slice(0, 10), duration_s: 3600, distance_m: 10000, updated_at: 0 });
    upsert(db, 'activity_records', ['activity_id', 'time'], { activity_id: r.id, time: r.start, lat: r.lat, lon: r.lon, distance_m: 0 });
  }
  // A treadmill run has no GPS and never asks for weather.
  upsert(db, 'activities', ['activity_id'], { activity_id: 5, type_key: 'treadmill_running', start_time: Date.UTC(2026, 9, 2, 6), start_time_local: '2026-10-02T09:00:00', calendar_date: '2026-10-02', duration_s: 1800, updated_at: 0 });
  return db;
}

test('backfill: one request per place and year, recent runs from the forecast endpoint, mid-run hour stored', async () => {
  const db = seedRuns();
  const urls: string[] = [];
  const now = Date.UTC(2026, 9, 30, 10);
  const result = await syncWeather(db, fakeOpenMeteo(urls), now);
  assert.deepEqual(result, { added: 4, requests: 3, failed: 0, remaining: 0 });
  assert.equal(urls.filter((u) => u.includes('archive-api')).length, 2);
  assert.equal(urls.filter((u) => u.includes('/v1/forecast')).length, 1);
  const row = db.prepare('SELECT hour, temp_c, dew_point_c, source FROM activity_weather WHERE activity_id = 1').get() as Record<string, unknown>;
  assert.equal(row.hour, Date.UTC(2025, 5, 10, 6), 'mid-run is 06:30, halfway between two hours: the earlier one is kept');
  assert.equal(row.temp_c, 20);
  assert.equal(row.source, 'archive');
  // A second sync has nothing left to do.
  assert.deepEqual(await syncWeather(db, fakeOpenMeteo(urls), now), { added: 0, requests: 0, failed: 0, remaining: 0 });
});

test('backfill: an unreachable service is counted, not thrown, and the runs are retried next time', async () => {
  const db = seedRuns();
  const result = await syncWeather(db, fakeOpenMeteo([], true), Date.UTC(2026, 9, 30, 10));
  assert.equal(result.added, 0);
  assert.equal(result.failed, 3);
  assert.equal(result.remaining, 4);
});

test('best time to run: the coolest dry window, the hot hour to avoid, local clock hours', () => {
  const day = Date.UTC(2026, 6, 15); // Athens is UTC+3 in July
  const hours = Array.from({ length: 48 }, (_, i) => {
    const localHour = (i + 3) % 24;
    // Cool early, hot mid-afternoon; rain at 07:00 local.
    const temp = 22 + 12 * Math.max(0, Math.sin(((localHour - 8) / 14) * Math.PI));
    return { time: day + i * HOUR, temp_c: temp, dew_point_c: 16, humidity_pct: 50, wind_kmh: 5, rain_pct: localHour === 7 ? 80 : 0 };
  });
  const [today] = planDays(hours, day, 'Europe/Athens');
  assert.equal(today!.best?.from, '06:00', 'the rainy 07:00 hour is skipped, so the window starts at 06:00 and can’t grow past it');
  assert.equal(today!.best?.to, '07:00');
  assert.equal(today!.avoid?.from, '15:00');
  assert.ok(today!.avoid!.heat.pct > 2);
});

test('forecast: cached for an hour, then refreshed; without network the last forecast is returned as stale', async () => {
  const db = seedRuns();
  const now = Date.UTC(2026, 9, 30, 6);
  await syncWeather(db, fakeOpenMeteo([]), now);
  const urls: string[] = [];
  const first = await getRunForecast(db, fakeOpenMeteo(urls), now);
  assert.equal(urls.length, 1);
  assert.equal(first?.stale, false);
  await getRunForecast(db, fakeOpenMeteo(urls), now + 30 * 60_000);
  assert.equal(urls.length, 1, 'within the hour: served from the cache');
  const offline = await getRunForecast(db, fakeOpenMeteo(urls, true), now + 2 * HOUR);
  assert.equal(offline?.stale, true);
  assert.ok(offline!.days[0]!.hours.length > 0);
});
