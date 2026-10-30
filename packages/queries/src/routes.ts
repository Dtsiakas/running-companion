import type { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;
/** One point every this many metres: smooth on a phone, small to send (a 10 km run is about 400 points). */
const STEP_M = 25;
/** Pace is measured over this distance around each point, so single GPS jumps don't paint a segment red. */
const PACE_WINDOW_M = 100;

export interface Route {
  activity_id: number;
  /** [lat, lon] per point. */
  points: Array<[number, number]>;
  /** Seconds per km around each point; null where the watch paused or GPS dropped. */
  pace: Array<number | null>;
  /** The run's own spread of pace (10th and 90th percentile), for the colour scale. */
  pace_range: [number, number] | null;
  bounds: [[number, number], [number, number]];
}

/** The run's GPS track, thinned to one point every 25 m, with the pace around each point. Null for runs without GPS. */
export function getRoute(db: DatabaseSync, activityId: number): Route | null {
  const rows = db.prepare('SELECT time, lat, lon, distance_m FROM activity_records WHERE activity_id = ? AND lat IS NOT NULL AND distance_m IS NOT NULL ORDER BY time').all(activityId) as Row[];
  if (rows.length < 10) return null;

  const kept: Array<{ t: number; lat: number; lon: number; d: number }> = [];
  for (const row of rows) {
    const point = { t: Number(row.time), lat: Number(row.lat), lon: Number(row.lon), d: Number(row.distance_m) };
    if (!kept.length || point.d - kept.at(-1)!.d >= STEP_M) kept.push(point);
  }
  const half = Math.round(PACE_WINDOW_M / STEP_M / 2);
  const pace = kept.map((_, i) => {
    const a = kept[Math.max(0, i - half)]!;
    const b = kept[Math.min(kept.length - 1, i + half)]!;
    const metres = b.d - a.d;
    const seconds = (b.t - a.t) / 1000;
    const secPerKm = metres > 0 ? (seconds / metres) * 1000 : null;
    // Slower than 15:00/km is standing or walking at a crossing; leave it uncoloured rather than stretch the scale.
    return secPerKm !== null && secPerKm < 900 ? Math.round(secPerKm) : null;
  });
  const sorted = pace.filter((p): p is number => p !== null).sort((x, y) => x - y);
  const at = (q: number) => sorted[Math.floor((sorted.length - 1) * q)]!;
  const lats = kept.map((p) => p.lat);
  const lons = kept.map((p) => p.lon);
  return {
    activity_id: activityId,
    points: kept.map((p) => [round5(p.lat), round5(p.lon)]),
    pace,
    pace_range: sorted.length ? [at(0.1), at(0.9)] : null,
    bounds: [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ],
  };
}

export interface Place {
  lat: number;
  lon: number;
  name: string | null;
  runs: number;
  km: number;
  first: string;
  last: string;
  /** The most recent run there, to open from the map. */
  last_activity_id: number;
}

/** Every place you've started a run, grouped to about 1 km, most runs first. */
export function getPlaces(db: DatabaseSync): Place[] {
  const rows = db
    .prepare(
      `WITH starts AS (
         SELECT a.activity_id, a.calendar_date, a.distance_m, a.location_name,
                (SELECT lat FROM activity_records r WHERE r.activity_id = a.activity_id AND r.lat IS NOT NULL ORDER BY r.time LIMIT 1) AS lat,
                (SELECT lon FROM activity_records r WHERE r.activity_id = a.activity_id AND r.lat IS NOT NULL ORDER BY r.time LIMIT 1) AS lon
         FROM activities a WHERE a.type_key LIKE '%running%')
       SELECT ROUND(AVG(lat), 4) AS lat, ROUND(AVG(lon), 4) AS lon, COUNT(*) AS runs, SUM(distance_m) AS m,
              MIN(calendar_date) AS first, MAX(calendar_date) AS last, MAX(location_name) AS name,
              (SELECT s2.activity_id FROM starts s2 WHERE ROUND(s2.lat, 2) = ROUND(starts.lat, 2) AND ROUND(s2.lon, 2) = ROUND(starts.lon, 2) ORDER BY s2.calendar_date DESC LIMIT 1) AS last_id
       FROM starts WHERE lat IS NOT NULL
       GROUP BY ROUND(lat, 2), ROUND(lon, 2) ORDER BY runs DESC`,
    )
    .all() as Row[];
  return rows.map((r) => ({
    lat: Number(r.lat),
    lon: Number(r.lon),
    name: r.name === null ? null : String(r.name),
    runs: Number(r.runs),
    km: Math.round(Number(r.m ?? 0) / 100) / 10,
    first: String(r.first),
    last: String(r.last),
    last_activity_id: Number(r.last_id),
  }));
}

const round5 = (v: number) => Math.round(v * 1e5) / 1e5;
