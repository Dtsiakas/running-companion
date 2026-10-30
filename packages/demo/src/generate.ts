import type { DatabaseSync } from 'node:sqlite';
import { transaction, upsert, type Row } from '@companion/db';
import { seeded, type Random } from './random.ts';
import { addDays, clockTime, dayOfYear, daysBetween, weekday, zonedEpoch } from './time.ts';

/**
 * A made-up runner, written into the same tables a Garmin sync fills, so every screen, insight and connector tool
 * works on it unchanged. For trying the app without a Garmin key, for screenshots, and for checking how the app
 * behaves when parts of the data are missing (see `missing`).
 *
 * The model is simple but consistent: fitness grows over the years, heart rate follows pace, hills and heat, hard
 * days lower the next night's HRV and raise resting heart rate, an illness week and a holiday break the routine.
 * Nothing here is anyone's real data.
 */
export interface DemoOptions {
  /** The last day with data, YYYY-MM-DD in `timeZone`. */
  today: string;
  /** Length of the history in days. Default about three years. */
  days?: number;
  seed?: number;
  timeZone?: string;
  /** Data streams to leave out, as some watches, setups or newcomers would. */
  missing?: readonly MissingStream[];
  /** Clock for `updated_at` fields. */
  now?: number;
}

export const MISSING_STREAMS = ['dynamics', 'power', 'hrv', 'scale', 'battery-events', 'sleep', 'gps', 'fitness-age'] as const;
export type MissingStream = (typeof MISSING_STREAMS)[number];

export interface DemoSummary {
  from: string;
  to: string;
  runs: number;
  records: number;
}

export const DEMO_PLACE = { name: 'Riverside', lat: 45.0, lon: 10.0, timeZone: 'Europe/Rome' } as const;

const MAX_HR = 191;
const LTHR = 172;
const HEIGHT_M = 1.78;
const ZONE_FLOORS = [97, 116, 134, 157, 172] as const;

type Kind = 'easy' | 'recovery' | 'long' | 'tempo' | 'threshold' | 'vo2' | 'anaerobic';

const WORKOUT_NAME: Record<Kind, string> = {
  easy: 'Base',
  recovery: 'Recovery',
  long: 'Long Run',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2: 'VO2 Max',
  anaerobic: 'Anaerobic',
};

const TE_LABEL: Record<Kind, string> = {
  easy: 'AEROBIC_BASE',
  recovery: 'RECOVERY',
  long: 'AEROBIC_BASE',
  tempo: 'TEMPO',
  threshold: 'LACTATE_THRESHOLD',
  vo2: 'VO2MAX',
  anaerobic: 'ANAEROBIC_CAPACITY',
};

interface Plan {
  kind: Kind;
  /** Kilometres for steady runs; ignored by structured workouts. */
  km: number;
  treadmill: boolean;
  /** Minutes after midnight. */
  startMinute: number;
}

interface Segment {
  /** Seconds, or metres when `metres` is true. */
  amount: number;
  metres: boolean;
  /** Fraction of threshold speed. */
  pace: number;
  intensity: 'active' | 'warmup' | 'interval' | 'recovery' | 'cooldown';
  step: number | null;
}

export function generateDemo(db: DatabaseSync, options: DemoOptions): DemoSummary {
  const timeZone = options.timeZone ?? DEMO_PLACE.timeZone;
  const days = options.days ?? 3 * 365;
  const missing = new Set(options.missing ?? []);
  const now = options.now ?? Date.now();
  const random = seeded(options.seed ?? 22);
  const to = options.today;
  const from = addDays(to, -(days - 1));
  // The story's fixed points, counted back from today so any history length tells the same recent story.
  const illness = { start: addDays(to, -330), end: addDays(to, -322) };
  const holiday = { start: addDays(to, -150), end: addDays(to, -141) };
  const scaleSince = addDays(to, -540);

  let runs = 0;
  let records = 0;
  let yesterdayLoad = 0;
  let lastBatteryEnd = 30;
  const hrvHistory: number[] = [];
  let latestRhr = 50;
  let latestBodyFat = 18;

  const columns = ['activity_id', 'time', 'lat', 'lon', 'distance_m', 'speed_mps', 'altitude_m', 'hr', 'cadence_spm', 'power_w', 'gct_ms', 'vertical_oscillation_mm', 'vertical_ratio_pct', 'step_length_mm', 'temperature_c'];
  const insertRecord = db.prepare(`INSERT OR REPLACE INTO activity_records (${columns.join(', ')}) VALUES (${columns.map((c) => `:${c}`).join(', ')})`);

  transaction(db, () => {
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const t = daysBetween(from, date) + Math.max(0, 3 * 365 - days);
      const ill = date >= illness.start && date <= illness.end;
      const away = date >= holiday.start && date <= holiday.end;
      const fitness = fitnessOn(t, daysBetween(illness.end, date));
      const vt = 3.3 + 0.55 * fitness; // threshold speed, m/s
      const weekend = weekday(date) >= 5;

      // Last night: recovery from yesterday shows in resting HR, HRV and sleep.
      const strain = Math.min(1, yesterdayLoad / 180);
      const rhrBase = 54 - 9 * fitness;
      const rhr = Math.round(rhrBase + 3 * strain + (ill ? 6 : 0) + random.normal(0, 1.2));
      latestRhr = rhr;
      const hrvBase = 52 + 28 * fitness;
      const drinks = (weekday(date) === 5 || weekday(date) === 6) && random.chance(0.12);
      const hrv = Math.round(hrvBase * (1 - 0.12 * strain) * (ill ? 0.72 : 1) * (drinks ? 0.85 : 1) * (1 + random.normal(0, 0.07)));
      hrvHistory.push(hrv);
      const sleep = sleepNight(random, date, timeZone, { weekendNight: weekday(date) === 5 || weekday(date) === 6, ill, hrvRatio: hrv / hrvBase, strain, now });
      if (!missing.has('sleep')) upsert(db, 'sleep', ['calendar_date'], sleep.row);
      if (!missing.has('hrv')) upsert(db, 'hrv', ['calendar_date'], hrvRow(date, hrv, hrvHistory, now));

      // Today's run, if the plan has one and life allows it.
      const plan = ill || away ? null : planFor(random, date, t, fitness);
      let run: SimulatedRun | null = null;
      if (plan) {
        run = simulateRun(random, { date, plan, vt, rhr, timeZone, missing, id: 1_000_000 + t, now });
        upsert(db, 'activities', ['activity_id'], run.activity);
        for (const lap of run.laps) upsert(db, 'activity_laps', ['activity_id', 'lap_index'], lap);
        // Every second for the last year, every third second before (as with Garmin's "smart" recording): a third
        // of the size, and the old runs are only ever looked at as summaries and best efforts.
        const every = daysBetween(date, to) <= 365 ? 1 : 3;
        const kept = run.records.filter((_, i) => i % every === 0 || i === run!.records.length - 1);
        for (const record of kept) insertRecord.run(record as Record<string, never>);
        records += kept.length;
        // Weather is looked up by where a run started, so runs without GPS have none, as with a real sync.
        if (run.weather) upsert(db, 'activity_weather', ['activity_id'], run.weather);
        runs += 1;
      }
      yesterdayLoad = run ? Number(run.activity.training_load) : 0;

      const wellness = wellnessDay(random, date, { rhr, run, sleep, ill, away, weekend, lastBatteryEnd, missing, now });
      lastBatteryEnd = Number(wellness.body_battery_end);
      upsert(db, 'daily_wellness', ['calendar_date'], wellness);

      if (!missing.has('scale') && date >= scaleSince && random.chance(0.55)) {
        const weighIn = weighInRow(random, date, timeZone, daysBetween(scaleSince, date) / daysBetween(scaleSince, to), now);
        latestBodyFat = Number(weighIn.body_fat_pct);
        upsert(db, 'weigh_ins', ['sample_pk'], weighIn);
      }
    }

    upsert(db, 'profile_snapshots', ['calendar_date'], {
      calendar_date: to,
      max_hr: MAX_HR,
      resting_hr_used: latestRhr,
      lactate_threshold_hr: LTHR,
      hr_zone_method: 'HR_MAX',
      hr_zone1_floor: ZONE_FLOORS[0],
      hr_zone2_floor: ZONE_FLOORS[1],
      hr_zone3_floor: ZONE_FLOORS[2],
      hr_zone4_floor: ZONE_FLOORS[3],
      hr_zone5_floor: ZONE_FLOORS[4],
      fitness_age: 29,
      chronological_age: 34,
      weight_goal_kg: missing.has('scale') ? null : 71,
      time_zone: timeZone,
      updated_at: now,
    });
    if (!missing.has('fitness-age')) {
      const components: Record<string, unknown> = {
        vigorousDaysAvg: { value: 3.4, stale: false },
        rhr: { value: latestRhr, stale: false },
        vigorousMinutesAvg: { value: 142, stale: false },
      };
      if (!missing.has('scale')) components.bodyFat = { value: latestBodyFat, targetValue: 15, potentialAge: 27, priority: 1, stale: false };
      upsert(db, 'raw_responses', ['endpoint', 'key'], {
        endpoint: 'fitness-age',
        key: to,
        fetched_at: now,
        body: JSON.stringify({ chronologicalAge: 34, fitnessAge: 29, achievableFitnessAge: 27, components }),
      });
    }
    for (const stream of ['activities', 'daily_wellness', 'sleep', 'hrv', 'weigh_ins']) {
      upsert(db, 'sync_state', ['stream'], { stream, newest_date: to, oldest_date: from, backfill_done: 1, empty_streak: 0, updated_at: now });
    }
  });

  return { from, to, runs, records };
}

/**
 * 0–1: how fit the runner is. Grows quickly at first, then slowly; the illness costs a few weeks of it, regained over
 * about two months.
 */
function fitnessOn(t: number, daysSinceIllness: number): number {
  const base = 1 - Math.exp(-(t + 250) / 520);
  const setback = daysSinceIllness >= -8 && daysSinceIllness < 90 ? 0.05 * Math.exp(-Math.max(0, daysSinceIllness) / 40) : 0;
  return base - setback;
}

// Plans ----------------------------------------------------------------------------------------------------------------

/**
 * A steady week: Tuesday quality, Wednesday easy, Thursday sometimes, Saturday long, Sunday easy. Long runs build for
 * three weeks and drop on the fourth. Winter evenings move some runs onto the treadmill.
 */
function planFor(random: Random, date: string, t: number, fitness: number): Plan | null {
  const day = weekday(date);
  const week = Math.floor(t / 7);
  const block = week % 4; // 0–2 build, 3 easier
  const month = Number(date.slice(5, 7));
  const winter = month === 12 || month <= 2;
  const summer = month >= 6 && month <= 8;
  // Christmas fortnight: fewer runs.
  const festive = (month === 12 && Number(date.slice(8)) >= 20) || (month === 1 && Number(date.slice(8)) <= 3);
  if (random.chance(festive ? 0.45 : 0.08)) return null;

  const evening = (summer ? 19.5 : 18.25) * 60 + random.normal(0, 35);
  const morning = (summer ? 7.25 : 8.75) * 60 + random.normal(0, 30);
  const treadmill = winter && day <= 4 && random.chance(0.3);
  const steady = (kind: Kind, km: number): Plan => ({ kind, km: Math.max(3, km), treadmill, startMinute: day >= 5 ? morning : evening });

  switch (day) {
    case 1: {
      const kind = (['tempo', 'threshold', 'vo2', 'anaerobic'] as const)[week % 4]!;
      return { kind, km: 0, treadmill, startMinute: evening };
    }
    case 2:
      return steady('easy', random.between(6.5, 9.5));
    case 3:
      return random.chance(0.55) ? steady(random.chance(0.4) ? 'recovery' : 'easy', random.between(5.5, 8)) : null;
    case 5:
      return { ...steady('long', (10.5 + 9 * fitness + [0, 1.5, 3, -2.5][block]!) * random.between(0.95, 1.05)), treadmill: false };
    case 6:
      return steady(random.chance(0.35) ? 'recovery' : 'easy', random.between(5, 8.5));
    default:
      return day === 0 && random.chance(0.12) ? steady('recovery', random.between(4, 6)) : null;
  }
}

function segmentsFor(plan: Plan, random: Random): Segment[] {
  const steady = (pace: number): Segment[] => [{ amount: plan.km * 1000, metres: true, pace, intensity: 'active', step: null }];
  const workout = (reps: number, workS: number, workPace: number, restS: number): Segment[] => {
    const segments: Segment[] = [{ amount: 15 * 60, metres: false, pace: 0.74, intensity: 'warmup', step: 0 }];
    for (let i = 0; i < reps; i++) {
      segments.push({ amount: workS, metres: false, pace: workPace, intensity: 'interval', step: 1 + i * 2 });
      if (i < reps - 1) segments.push({ amount: restS, metres: false, pace: 0.66, intensity: 'recovery', step: 2 + i * 2 });
    }
    segments.push({ amount: 10 * 60, metres: false, pace: 0.72, intensity: 'cooldown', step: reps * 2 });
    return segments;
  };
  switch (plan.kind) {
    case 'easy':
      return steady(random.between(0.74, 0.79));
    case 'recovery':
      return steady(random.between(0.68, 0.72));
    case 'long': {
      // Every third long run finishes faster for the last few kilometres.
      if (!random.chance(0.33)) return steady(random.between(0.75, 0.79));
      const fast = Math.min(4, plan.km * 0.25);
      return [
        { amount: (plan.km - fast) * 1000, metres: true, pace: 0.77, intensity: 'active', step: null },
        { amount: fast * 1000, metres: true, pace: 0.88, intensity: 'active', step: null },
      ];
    }
    case 'tempo':
      return workout(1, random.pick([20, 25, 30]) * 60, 0.92, 0);
    case 'threshold':
      return workout(3, 8 * 60, 1.0, 2 * 60);
    case 'vo2':
      return workout(5, 3 * 60, 1.1, 2 * 60);
    case 'anaerobic':
      return workout(8, 60, 1.22, 2 * 60);
  }
}

// One run, second by second ------------------------------------------------------------------------------------------

interface SimulatedRun {
  activity: Row;
  laps: Row[];
  records: Row[];
  weather: Row | null;
}

interface Sample {
  time: number;
  elapsed: number;
  lat: number | null;
  lon: number | null;
  distance: number;
  speed: number;
  altitude: number | null;
  hr: number;
  cadence: number;
  power: number;
  gct: number;
  vo: number;
  stepLength: number;
  temperature: number;
  segment: number;
}

const ROUTES = [
  { cx: 0, cy: 0, radius: 750, phase: 0 },
  { cx: 900, cy: 600, radius: 1100, phase: 1.3 },
  { cx: -700, cy: 900, radius: 950, phase: 2.1 },
  { cx: 300, cy: -1200, radius: 1500, phase: 0.6 },
] as const;

/** A position along a wobbly loop, in metres from the town centre, plus the terrain height there. */
function positionOn(route: (typeof ROUTES)[number], metres: number) {
  const perimeter = 2 * Math.PI * route.radius;
  const angle = (2 * Math.PI * metres) / perimeter;
  const radius = route.radius * (1 + 0.1 * Math.sin(3 * angle + route.phase));
  const x = route.cx + radius * Math.cos(angle);
  const y = route.cy + radius * Math.sin(angle);
  return { x, y, altitude: 48 + 14 * Math.sin(x / 700) + 9 * Math.cos(y / 900) };
}

function airTemperature(date: string, hour: number): number {
  const seasonal = 13.5 + 10.5 * Math.cos((2 * Math.PI * (dayOfYear(date) - 200)) / 365);
  const daily = 4 * Math.cos((2 * Math.PI * (hour - 15)) / 24);
  return seasonal + daily;
}

function simulateRun(random: Random, input: { date: string; plan: Plan; vt: number; rhr: number; timeZone: string; missing: Set<MissingStream>; id: number; now: number }): SimulatedRun {
  const { date, plan, vt, rhr, missing } = input;
  const indoor = plan.treadmill || missing.has('gps');
  const route = random.pick(ROUTES);
  const startLocal = `${date}T${clockTime(plan.startMinute)}`;
  const startTime = zonedEpoch(startLocal, input.timeZone);
  const hour = plan.startMinute / 60;
  const air = airTemperature(date, hour) + random.normal(0, 2);
  const dewPoint = air - random.between(4, 12);
  const form = random.normal(1, 0.02); // good and bad days
  const segments = segmentsFor(plan, random);

  const samples: Sample[] = [];
  let timer = 0;
  let elapsed = 0;
  let distance = 0;
  let speed = 1.8;
  let hr = rhr + 35;
  let cadence = 160;
  const offset = random.between(0, 2 * Math.PI * route.radius);

  segments.forEach((segment, index) => {
    const startTimer = timer;
    const startDistance = distance;
    const done = () => (segment.metres ? distance - startDistance >= segment.amount : timer - startTimer >= segment.amount);
    while (!done()) {
      // Traffic lights and shoelaces on easy road runs: the watch pauses, so no samples for a while.
      if (!indoor && segment.intensity === 'active' && random.chance(1 / 1800)) {
        elapsed += Math.round(random.between(12, 45));
        speed = 1.2;
      }
      const here = positionOn(route, offset + distance);
      const ahead = positionOn(route, offset + distance + 5);
      const grade = indoor ? 0 : (ahead.altitude - here.altitude) / 5;
      const target = segment.pace * vt * form * (1 - grade * 3) * (1 + random.normal(0, 0.012));
      speed += (target - speed) * 0.18;
      speed = Math.max(1, speed);
      distance += speed;
      timer += 1;
      elapsed += 1;

      const effort = (speed / vt) * (1 + grade * 5);
      const drift = (timer / 3600) * 4;
      const heat = Math.max(0, air - 16) * 0.35;
      const hrTarget = Math.min(MAX_HR, rhr + (LTHR - rhr) * (0.5 + 0.5 * effort ** 2.4) + drift + heat);
      hr += (hrTarget - hr) / (hrTarget > hr ? 20 : 35);
      cadence += (Math.min(196, Math.max(150, 158 + 11 * (speed - 2.5))) - cadence) * 0.3;

      const cadenceNow = cadence + random.normal(0, 1);
      const stepLength = (speed / (cadenceNow / 60)) * 1000;
      samples.push({
        time: startTime + elapsed * 1000,
        elapsed,
        lat: indoor ? null : DEMO_PLACE.lat + here.y / 111_320,
        lon: indoor ? null : DEMO_PLACE.lon + here.x / (111_320 * Math.cos((DEMO_PLACE.lat * Math.PI) / 180)),
        distance,
        speed,
        altitude: indoor ? null : here.altitude,
        hr: Math.round(hr + random.normal(0, 0.8)),
        cadence: Math.round(cadenceNow),
        power: Math.round(72 * speed * 1.35 * (1 + grade * 4) + random.normal(0, 4)),
        gct: Math.round(272 - 24 * (speed - 2.5) + random.normal(0, 2)),
        vo: Math.round((90 - 3 * (speed - 3) + random.normal(0, 0.6)) * 10) / 10,
        stepLength: Math.round(stepLength),
        temperature: Math.round(indoor ? 22 : air + 5.5 + random.normal(0, 0.8)),
        segment: index,
      });
    }
  });

  const noDynamics = missing.has('dynamics');
  const noPower = missing.has('power');
  const records = samples.map(
    (s): Row => ({
      activity_id: input.id,
      time: s.time,
      lat: s.lat,
      lon: s.lon,
      distance_m: Math.round(s.distance * 100) / 100,
      speed_mps: Math.round(s.speed * 1000) / 1000,
      altitude_m: s.altitude === null ? null : Math.round(s.altitude * 10) / 10,
      hr: s.hr,
      cadence_spm: s.cadence,
      power_w: noPower ? null : s.power,
      gct_ms: noDynamics ? null : s.gct,
      vertical_oscillation_mm: noDynamics ? null : s.vo,
      vertical_ratio_pct: noDynamics ? null : Math.round((s.vo / s.stepLength) * 10000) / 100,
      step_length_mm: noDynamics ? null : s.stepLength,
      temperature_c: s.temperature,
    }),
  );

  // Laps: every kilometre on steady runs, every step on structured workouts (as the watch does).
  const structured = segments.some((segment) => segment.step !== null);
  const groups: Sample[][] = [];
  for (const sample of samples) {
    const key = structured ? sample.segment : Math.floor((sample.distance - 0.001) / 1000);
    const last = groups.at(-1);
    if (last && (structured ? last[0]!.segment : Math.floor((last[0]!.distance - 0.001) / 1000)) === key) last.push(sample);
    else groups.push([sample]);
  }
  let previousDistance = 0;
  let previousElapsed = 0;
  const laps = groups.map((group, lapIndex): Row => {
    const stats = summarize(group, noDynamics, noPower);
    const lastSample = group.at(-1)!;
    const lap: Row = {
      activity_id: input.id,
      lap_index: lapIndex,
      start_time: group[0]!.time - 1000,
      elapsed_s: lastSample.elapsed - previousElapsed,
      timer_s: group.length,
      distance_m: Math.round((lastSample.distance - previousDistance) * 100) / 100,
      ...stats.lap,
      intensity: structured ? segments[lastSample.segment]!.intensity : 'active',
      lap_trigger: lapIndex === groups.length - 1 ? 'session_end' : structured ? 'time' : 'distance',
      workout_step_index: structured ? segments[lastSample.segment]!.step : null,
    };
    previousDistance = lastSample.distance;
    previousElapsed = lastSample.elapsed;
    return lap;
  });

  const all = summarize(samples, noDynamics, noPower);
  const durationS = samples.length;
  const elapsedS = samples.at(-1)!.elapsed;
  const distanceM = samples.at(-1)!.distance;
  const zoneSeconds = [0, 0, 0, 0, 0];
  let load = 0;
  let aboveThreshold = 0;
  for (const s of samples) {
    const zone = ZONE_FLOORS.findLastIndex((floor) => s.hr >= floor);
    if (zone >= 0) zoneSeconds[zone]! += 1;
    const reserve = Math.max(0, (s.hr - rhr) / (MAX_HR - rhr));
    load += (1 / 60) * reserve * 0.64 * Math.exp(1.92 * reserve);
    if (s.hr >= LTHR) aboveThreshold += 1;
  }
  const trainingLoad = Math.round(load * 1.25);
  const kmh = 3.6 * (distanceM / durationS);
  const placeName = plan.treadmill ? 'Treadmill' : DEMO_PLACE.name;

  const activity: Row = {
    activity_id: input.id,
    name: `${placeName} - ${WORKOUT_NAME[plan.kind]}`,
    type_key: plan.treadmill ? 'treadmill_running' : 'running',
    parent_type_id: 17,
    start_time: startTime,
    start_time_local: startLocal,
    calendar_date: date,
    location_name: indoor ? null : DEMO_PLACE.name,
    workout_name: WORKOUT_NAME[plan.kind],
    is_pr: 0,
    distance_m: Math.round(distanceM * 10) / 10,
    duration_s: durationS,
    moving_duration_s: durationS,
    elapsed_duration_s: elapsedS,
    elevation_gain_m: all.gain,
    elevation_loss_m: all.loss,
    avg_speed_mps: Math.round((distanceM / durationS) * 1000) / 1000,
    max_speed_mps: all.lap.max_speed_mps,
    avg_gap_speed_mps: Math.round((distanceM / durationS) * 1000) / 1000,
    steps: Math.round((Number(all.lap.avg_cadence_spm) * durationS) / 60),
    calories: Math.round((distanceM / 1000) * 72 * 1.03),
    avg_hr: all.lap.avg_hr,
    max_hr: all.lap.max_hr,
    min_hr: Math.min(...samples.map((s) => s.hr)),
    avg_cadence_spm: all.lap.avg_cadence_spm,
    max_cadence_spm: Math.max(...samples.map((s) => s.cadence)),
    avg_power_w: all.lap.avg_power_w,
    max_power_w: all.lap.max_power_w,
    norm_power_w: all.lap.norm_power_w,
    avg_gct_ms: all.lap.avg_gct_ms,
    avg_vertical_oscillation_mm: all.lap.avg_vertical_oscillation_mm,
    avg_vertical_ratio_pct: noDynamics ? null : Math.round((Number(all.lap.avg_vertical_oscillation_mm) / Number(all.lap.avg_step_length_mm)) * 10000) / 100,
    avg_step_length_mm: all.lap.avg_step_length_mm,
    avg_temp_c: Math.round(samples.reduce((sum, s) => sum + s.temperature, 0) / samples.length),
    min_temp_c: Math.min(...samples.map((s) => s.temperature)),
    max_temp_c: Math.max(...samples.map((s) => s.temperature)),
    aerobic_te: Math.round(Math.min(5, Math.max(1, 0.8 + trainingLoad / 62)) * 10) / 10,
    anaerobic_te: Math.round(Math.min(4, 0.2 + aboveThreshold / (plan.kind === 'anaerobic' ? 150 : 600)) * 10) / 10,
    te_label: TE_LABEL[plan.kind],
    training_load: trainingLoad,
    moderate_intensity_min: Math.round((zoneSeconds[0]! + zoneSeconds[1]!) / 60),
    vigorous_intensity_min: Math.round((zoneSeconds[2]! + zoneSeconds[3]! + zoneSeconds[4]!) / 60),
    body_battery_delta: -Math.round(trainingLoad / 9),
    hr_zone1_s: zoneSeconds[0],
    hr_zone2_s: zoneSeconds[1],
    hr_zone3_s: zoneSeconds[2],
    hr_zone4_s: zoneSeconds[3],
    hr_zone5_s: zoneSeconds[4],
    details_synced: 1,
    updated_at: input.now,
    // Garmin's sweat-loss estimate: more with time and heat.
    water_estimated_ml: Math.round(((durationS / 3600) * 650 * (1 + Math.max(0, air - 15) * 0.035) * (kmh / 10)) / 10) * 10,
  };

  const weather: Row | null = indoor ? null : {
    activity_id: input.id,
    lat: DEMO_PLACE.lat,
    lon: DEMO_PLACE.lon,
    hour: Math.floor(startTime / 3_600_000) * 3_600_000,
    temp_c: Math.round(air * 10) / 10,
    dew_point_c: Math.round(dewPoint * 10) / 10,
    humidity_pct: Math.round(100 * Math.exp((17.6 * dewPoint) / (243 + dewPoint) - (17.6 * air) / (243 + air))),
    wind_kmh: Math.round(random.between(3, 18)),
    source: 'archive',
    fetched_at: input.now,
  };

  return { activity, laps, records, weather };
}

function summarize(samples: Sample[], noDynamics: boolean, noPower: boolean) {
  const mean = (pick: (s: Sample) => number) => samples.reduce((sum, s) => sum + pick(s), 0) / samples.length;
  const max = (pick: (s: Sample) => number) => Math.max(...samples.map(pick));
  // Normalised power: the 4th-power mean of 30-second rolling averages.
  let rolling = 0;
  let sum4 = 0;
  samples.forEach((s, i) => {
    rolling += s.power - (i >= 30 ? samples[i - 30]!.power : 0);
    sum4 += (rolling / Math.min(i + 1, 30)) ** 4;
  });
  let gain = 0;
  let loss = 0;
  for (let i = 10; i < samples.length; i += 10) {
    const step = (samples[i]!.altitude ?? 0) - (samples[i - 10]!.altitude ?? 0);
    if (step > 0) gain += step;
    else loss -= step;
  }
  const r1 = (value: number) => Math.round(value * 10) / 10;
  return {
    gain: samples[0]!.altitude === null ? null : Math.round(gain),
    loss: samples[0]!.altitude === null ? null : Math.round(loss),
    lap: {
      avg_speed_mps: Math.round(mean((s) => s.speed) * 1000) / 1000,
      max_speed_mps: Math.round(max((s) => s.speed) * 1000) / 1000,
      avg_hr: Math.round(mean((s) => s.hr)),
      max_hr: max((s) => s.hr),
      avg_power_w: noPower ? null : Math.round(mean((s) => s.power)),
      max_power_w: noPower ? null : max((s) => s.power),
      norm_power_w: noPower ? null : Math.round((sum4 / samples.length) ** 0.25),
      avg_cadence_spm: r1(mean((s) => s.cadence)),
      avg_gct_ms: noDynamics ? null : r1(mean((s) => s.gct)),
      avg_vertical_oscillation_mm: noDynamics ? null : r1(mean((s) => s.vo)),
      avg_step_length_mm: noDynamics ? null : r1(mean((s) => s.stepLength)),
      ascent_m: samples[0]!.altitude === null ? null : Math.round(gain),
      descent_m: samples[0]!.altitude === null ? null : Math.round(loss),
    } satisfies Row,
  };
}

// Nights and days -------------------------------------------------------------------------------------------------------

function sleepNight(random: Random, date: string, timeZone: string, night: { weekendNight: boolean; ill: boolean; hrvRatio: number; strain: number; now: number }) {
  const bedtime = (night.weekendNight ? 24.2 : 23.3) * 60 + random.normal(0, night.weekendNight ? 35 : 25); // minutes after the previous midnight
  const hours = Math.min(10.5, Math.max(4.5, 7.55 + (night.weekendNight ? 0.45 : 0) + (night.ill ? 1.1 : 0) + random.normal(0, 0.6)));
  const sleepS = Math.round(hours * 3600 / 60) * 60;
  const deepPct = Math.round(Math.min(30, Math.max(8, 17 + random.normal(0, 3))));
  const remPct = Math.round(Math.min(30, Math.max(10, 21 + random.normal(0, 3))));
  const awakeS = Math.round(random.between(8, 40)) * 60;
  const start = zonedEpoch(`${addDays(date, -1)}T00:00:00`, timeZone) + bedtime * 60_000;
  const score = Math.round(Math.min(97, Math.max(32, 74 + 9 * (hours - 7.4) + (night.hrvRatio - 1) * 60 + random.normal(0, 5))));
  const needActual = 480 + (night.strain > 0.6 ? 30 : night.strain > 0.3 ? 15 : 0) + (night.ill ? 40 : 0);
  return {
    hours,
    score,
    sleepS,
    row: {
      calendar_date: date,
      start_time: Math.round(start),
      end_time: Math.round(start + (sleepS + awakeS) * 1000),
      sleep_s: sleepS,
      deep_s: Math.round((sleepS * deepPct) / 100),
      light_s: Math.round((sleepS * (100 - deepPct - remPct)) / 100),
      rem_s: Math.round((sleepS * remPct) / 100),
      awake_s: awakeS,
      nap_s: 0,
      awake_count: Math.round(random.between(0, 4)),
      score,
      score_qualifier: score >= 90 ? 'EXCELLENT' : score >= 80 ? 'GOOD' : score >= 60 ? 'FAIR' : 'POOR',
      duration_qualifier: hours >= 7 ? 'GOOD' : hours >= 6 ? 'FAIR' : 'POOR',
      stress_qualifier: night.ill ? 'FAIR' : 'GOOD',
      deep_pct: deepPct,
      light_pct: 100 - deepPct - remPct,
      rem_pct: remPct,
      avg_hr: null,
      avg_sleep_stress: Math.round(random.between(10, 22) + (night.ill ? 10 : 0)),
      avg_spo2_pct: Math.round(random.between(95, 97.5)),
      lowest_spo2_pct: Math.round(random.between(88, 93)),
      avg_respiration: Math.round(random.between(12.5, 14.5)),
      lowest_respiration: Math.round(random.between(8, 11)),
      highest_respiration: Math.round(random.between(16, 20)),
      need_baseline_min: 480,
      need_actual_min: needActual,
      next_need_min: needActual - 10,
      need_feedback: needActual > 500 ? 'INCREASED' : 'NO_CHANGE',
      score_feedback: null,
      score_insight: null,
      breathing_disruption: 'NONE',
      updated_at: night.now,
    } satisfies Row,
  };
}

/** Garmin's HRV bands come from your own recent nights: balanced is roughly the middle of your last few weeks. */
function hrvRow(date: string, hrv: number, history: number[], now: number): Row {
  const recent = history.slice(-21);
  const baseline = recent.reduce((sum, v) => sum + v, 0) / recent.length;
  const week = history.slice(-7);
  const weekly = Math.round(week.reduce((sum, v) => sum + v, 0) / week.length);
  const low = baseline * 0.88;
  const high = baseline * 1.16;
  const status = history.length < 21 ? null : weekly < baseline * 0.8 ? 'LOW' : weekly < low || weekly > high ? 'UNBALANCED' : 'BALANCED';
  return {
    calendar_date: date,
    last_night_avg_ms: hrv,
    last_night_5min_high_ms: Math.round(hrv * 1.45),
    weekly_avg_ms: weekly,
    baseline_low_upper_ms: history.length < 21 ? null : Math.round(baseline * 0.8),
    baseline_balanced_low_ms: history.length < 21 ? null : Math.round(low),
    baseline_balanced_upper_ms: history.length < 21 ? null : Math.round(high),
    status,
    feedback: status ? `HRV_${status}_1` : null,
    updated_at: now,
  };
}

function wellnessDay(
  random: Random,
  date: string,
  day: { rhr: number; run: SimulatedRun | null; sleep: { score: number; sleepS: number }; ill: boolean; away: boolean; weekend: boolean; lastBatteryEnd: number; missing: Set<MissingStream>; now: number },
): Row {
  const runSteps = day.run ? Number(day.run.activity.steps) : 0;
  const steps = Math.max(1500, Math.round(random.normal(day.away ? 13000 : day.ill ? 3000 : 7200, 1800) + runSteps));
  const stress = Math.round(Math.min(60, Math.max(12, 29 + (day.weekend ? -5 : 4) + (day.ill ? 9 : 0) + (day.away ? -7 : 0) + random.normal(0, 5))));
  const awakeS = 86_400 - day.sleep.sleepS;
  const high = Math.round(awakeS * (stress / 100) * 0.12);
  const medium = Math.round(awakeS * (stress / 100) * 0.3);
  const low = Math.round(awakeS * 0.35);
  const charged = Math.round(Math.min(100 - day.lastBatteryEnd, Math.max(10, day.sleep.score * 0.75 - 5 + random.normal(0, 6))));
  const peak = Math.min(100, day.lastBatteryEnd + charged);
  const runDrain = day.run ? -Number(day.run.activity.body_battery_delta) : 0;
  const stressDrain = Math.round(stress * 0.9 + random.normal(0, 4));
  const end = Math.max(5, Math.min(peak - 15, peak - runDrain - stressDrain - 12));
  const drained = peak - end;
  const vigorous = day.run ? Number(day.run.activity.vigorous_intensity_min) : 0;
  const moderate = (day.run ? Number(day.run.activity.moderate_intensity_min) : 0) + Math.round(random.between(0, 15));
  const noEvents = day.missing.has('battery-events');
  return {
    calendar_date: date,
    steps,
    step_goal: 8000,
    walking_distance_m: Math.round(steps * 0.78),
    floors_up: Math.round(random.between(2, 14)),
    floors_down: Math.round(random.between(2, 12)),
    resting_hr: day.rhr,
    min_hr: day.rhr - 3,
    max_hr: day.run ? Number(day.run.activity.max_hr) : Math.round(random.between(105, 135)),
    stress_avg: stress,
    stress_max: Math.round(random.between(70, 97)),
    stress_qualifier: stress < 26 ? 'calm' : stress < 40 ? 'balanced' : 'stressful',
    rest_stress_s: day.sleep.sleepS + Math.round(awakeS * 0.1),
    low_stress_s: low,
    medium_stress_s: medium,
    high_stress_s: high,
    body_battery_min: end,
    body_battery_max: peak,
    body_battery_charged: charged,
    body_battery_drained: drained,
    body_battery_end: end,
    moderate_intensity_min: moderate,
    vigorous_intensity_min: vigorous,
    intensity_goal_min: 150,
    calories_total: 2350 + (day.run ? Number(day.run.activity.calories) : 0),
    calories_active: 450 + (day.run ? Number(day.run.activity.calories) : 0),
    calories_resting: 1900,
    respiration_avg: Math.round(random.between(13, 15)),
    respiration_min: Math.round(random.between(8, 11)),
    respiration_max: Math.round(random.between(19, 26)),
    spo2_avg_pct: Math.round(random.between(95, 97.5)),
    spo2_min_pct: Math.round(random.between(89, 93)),
    hydration_ml: null,
    updated_at: day.now,
    bb_sleep: noEvents ? null : charged,
    bb_nap: null,
    bb_activity: noEvents || !day.run ? null : -runDrain,
    bb_stress: noEvents ? null : -stressDrain,
    bb_recovery: noEvents ? null : Math.round(random.between(-3, 6)),
  };
}

function weighInRow(random: Random, date: string, timeZone: string, progress: number, now: number): Row {
  const measuredAt = zonedEpoch(`${date}T07:${String(Math.round(random.between(0, 40))).padStart(2, '0')}:00`, timeZone);
  const festive = Math.max(0, Math.cos((2 * Math.PI * (dayOfYear(date) - 360)) / 365)) ** 6 * 0.9;
  const weight = Math.round((75.6 - 3.1 * progress + festive + random.normal(0, 0.35)) * 10) / 10;
  const fat = Math.round((20.2 - 3.4 * progress + festive * 0.8 + random.normal(0, 0.4)) * 10) / 10;
  return {
    sample_pk: measuredAt,
    measured_at: measuredAt,
    calendar_date: date,
    weight_kg: weight,
    bmi: Math.round((weight / HEIGHT_M ** 2) * 10) / 10,
    body_fat_pct: fat,
    body_water_pct: Math.round((57 + 0.4 * (20 - fat) + random.normal(0, 0.3)) * 10) / 10,
    muscle_mass_kg: Math.round((weight * (1 - fat / 100) * 0.53) * 10) / 10,
    bone_mass_kg: 3.3,
    visceral_fat: null,
    metabolic_age: null,
    source: 'INDEX_SCALE',
    updated_at: now,
  };
}
