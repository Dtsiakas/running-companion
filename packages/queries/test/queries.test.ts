import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { getActivity, getDay, getFitnessAge, getTrend, listActivities } from '@companion/queries';

const dir = mkdtempSync(join(tmpdir(), 'running-companion-queries-'));
const db = openDatabase(join(dir, 'test.db'));
after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A threshold workout as the watch records it: warm-up, interval, recovery, interval (repeat of step 1), cool-down.
 * Auto-lap every km splits the warm-up and each interval into two laps; the stop button leaves a 3-second remainder.
 */
function seedWorkout(): void {
  upsert(db, 'activities', ['activity_id'], { activity_id: 7, name: 'Threshold', type_key: 'running', start_time: 1, start_time_local: '2026-10-27T18:00:00', calendar_date: '2026-10-27', updated_at: 0 });
  const laps: Array<[step: number | null, intensity: string, metres: number, seconds: number, hr: number]> = [
    [0, 'warmup', 1000, 320, 135],
    [0, 'warmup', 860, 280, 149],
    [1, 'interval', 1000, 260, 160],
    [1, 'interval', 840, 220, 166],
    [2, 'recovery', 280, 120, 149],
    [1, 'interval', 1000, 258, 162],
    [1, 'interval', 850, 222, 164],
    [4, 'cooldown', 1840, 600, 147],
    [null, 'cooldown', 10, 3, 147],
  ];
  laps.forEach(([step, intensity, distance_m, timer_s, avg_hr], lap_index) =>
    upsert(db, 'activity_laps', ['activity_id', 'lap_index'], { activity_id: 7, lap_index, workout_step_index: step, intensity, distance_m, timer_s, avg_hr }),
  );
  const speed = (low: number, high: number) => ({ targetType: 'SPEED', targetValueLow: low, targetValueHigh: high });
  const steps = [
    { stepIndex: 0, durationType: 'TIME', durationValue: 600, intensity: 'WARMUP', ...speed(2.777, 3.166) },
    { stepIndex: 1, durationType: 'TIME', durationValue: 480, intensity: 'INTERVAL', ...speed(3.555, 3.833) },
    { stepIndex: 2, durationType: 'TIME', durationValue: 120, intensity: 'RECOVERY', ...speed(2.194, 2.777) },
    { stepIndex: 3, durationType: 'REPEAT_UNTIL_STEPS_CMPLT', durationValue: 1, targetValue: 2 },
    { stepIndex: 4, durationType: 'TIME', durationValue: 600, intensity: 'COOLDOWN', targetType: 'NO_TARGET' },
  ];
  upsert(db, 'raw_responses', ['endpoint', 'key'], { endpoint: 'activity-workouts', key: '7', fetched_at: 0, body: JSON.stringify([{ steps }]) });
}

test('planned vs actual merges auto-laps back into workout steps and judges each against its target', () => {
  seedWorkout();
  const activity = getActivity(db, 7);
  assert.ok(!('error' in activity));
  const steps = activity.executed_steps!;

  // 9 laps become 5 steps: the 3-second remainder is dropped, the repeated interval appears twice.
  assert.deepEqual(
    steps.map((s) => [s.step, s.time, s.distance_km]),
    [
      [0, '10:00', 1.86],
      [1, '8:00', 1.84],
      [2, '2:00', 0.28],
      [1, '8:00', 1.85],
      [4, '10:00', 1.84],
    ],
  );
  // 1840 m in 480 s is 4:21/km, the fast edge of 4:21–4:41 (as displayed), so on target. 1850 m in 480 s is 4:19/km: fast.
  assert.equal(steps[1]!.on_target, 'on');
  assert.equal(steps[3]!.on_target, 'fast');
  // A step with no pace target can't be judged.
  assert.equal(steps[4]!.on_target, null);
  assert.equal(steps[4]!.target_pace, null);
  // Heart rate is weighted by time: (160 × 260 + 166 × 220) / 480.
  assert.equal(steps[1]!.avg_hr, Math.round((160 * 260 + 166 * 220) / 480));
  assert.equal(steps[1]!.target_pace, '4:21/km – 4:41/km');
});

test('the run list pages with offset', () => {
  for (let i = 0; i < 5; i++) {
    upsert(db, 'activities', ['activity_id'], { activity_id: 100 + i, name: `Run ${i}`, type_key: 'running', start_time: 1000 + i, start_time_local: '2026-10-01T08:00:00', calendar_date: '2026-10-01', updated_at: 0 });
  }
  const first = listActivities(db, { type: 'running', limit: 2 }).map((a) => a.activity_id);
  const second = listActivities(db, { type: 'running', limit: 2, offset: 2 }).map((a) => a.activity_id);
  assert.deepEqual(first, [104, 103]);
  assert.deepEqual(second, [102, 101]);
});

test('getDay reads last night, today\'s Body Battery peak, yesterday\'s stress, and counts vigorous minutes double', () => {
  const day = (calendar_date: string, extra: Record<string, unknown>) =>
    upsert(db, 'daily_wellness', ['calendar_date'], { calendar_date, updated_at: 0, ...extra });
  // Wednesday 28 Oct and Thursday 29 Oct 2026; the week starts Monday 26 Oct.
  day('2026-10-25', { moderate_intensity_min: 500, vigorous_intensity_min: 500 }); // Sunday before: not this week
  day('2026-10-26', { moderate_intensity_min: 10, vigorous_intensity_min: 20, intensity_goal_min: 150 });
  day('2026-10-28', { stress_avg: 21, high_stress_s: 600, steps: 6000, calories_total: 2100, moderate_intensity_min: 0, vigorous_intensity_min: 40 });
  day('2026-10-29', { body_battery_max: 89, stress_avg: 9, steps: 3000, moderate_intensity_min: 5, vigorous_intensity_min: 0 });
  upsert(db, 'profile_snapshots', ['calendar_date'], { calendar_date: '2026-10-29', time_zone: 'Europe/Athens', weight_goal_kg: 68, updated_at: 0 });
  // Asleep 23:30 to 07:00 Athens time (UTC+2 in late October).
  upsert(db, 'sleep', ['calendar_date'], {
    calendar_date: '2026-10-29',
    start_time: Date.UTC(2026, 9, 28, 21, 30),
    end_time: Date.UTC(2026, 9, 29, 5, 0),
    sleep_s: 7 * 3600,
    deep_s: 5400,
    score: 80,
    avg_respiration: 11,
    updated_at: 0,
  });

  const result = getDay(db, '2026-10-29');
  assert.equal(result.sleep?.bedtime, '23:30');
  assert.equal(result.sleep?.wake_time, '07:00');
  assert.equal(result.sleep?.stages_h.deep, 1.5);
  assert.equal(result.energy.body_battery_morning, 89);
  assert.equal(result.energy.stress_yesterday_avg, 21, 'stress comes from the last complete day');
  assert.equal(result.energy.stress_yesterday_high_min, 10);
  assert.equal(result.activity.steps_today, 3000);
  // (10 + 2×20) + (0 + 2×40) + (5 + 0) = 135; Sunday the 25th belongs to the previous week.
  assert.equal(result.activity.intensity_minutes_week, 135);
  assert.equal(result.activity.intensity_goal_week, 150);
});

test('trend metrics read from daily wellness and sleep, not only from computed metrics and runs', () => {
  const steps = getTrend(db, 'steps', 'month', '2026-10-28', '2026-10-29');
  assert.ok(!('error' in steps));
  assert.deepEqual(steps.points.map((p) => p.raw), [4500]);
  const breathing = getTrend(db, 'breathing_rate', 'month', '2026-10-01');
  assert.ok(!('error' in breathing));
  assert.equal(breathing.points[0]?.raw, 11);
});

test('fitness age lists components in Garmin\'s priority order and names the biggest lever', () => {
  upsert(db, 'raw_responses', ['endpoint', 'key'], {
    endpoint: 'fitness-age',
    key: 'latest',
    fetched_at: 0,
    body: JSON.stringify({
      chronologicalAge: 27,
      fitnessAge: 18,
      components: { rhr: { value: 38 }, bodyFat: { value: 17.8, targetValue: 14.4, potentialAge: 18, priority: 1 }, unknownThing: { value: 1 } },
    }),
  });
  const age = getFitnessAge(db);
  assert.equal(age?.fitness_age, 18);
  assert.deepEqual(age?.components.map((c) => c.key), ['bodyFat', 'rhr'], 'unknown components are left out');
  assert.equal(age?.biggest_lever?.label, 'Body fat');
  assert.equal(age?.weight_goal_kg, 68);
});
