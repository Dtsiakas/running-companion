import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { getSleepReport, getStressReport } from '@companion/insights';

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 1); // Thursday 1 October 2026
const dateOf = (i: number) => new Date(START + i * DAY).toISOString().slice(0, 10);

/**
 * 28 nights in UTC. Weeknights: asleep at `bed` minutes from midnight, up at 07:00. Weekend mornings: up at 09:00.
 * Garmin's need is 8h every night, and 8h30 for the night after the last one.
 */
function seed(bed: number, nights = 28) {
  const db = openDatabase(':memory:');
  upsert(db, 'profile_snapshots', ['calendar_date'], { calendar_date: dateOf(0), time_zone: 'UTC', updated_at: 0 });
  for (let i = 0; i < nights; i++) {
    const date = dateOf(i);
    const midnight = START + i * DAY;
    const weekend = [0, 6].includes(new Date(midnight).getUTCDay());
    const wake = weekend ? 9 * 60 : 7 * 60;
    upsert(db, 'sleep', ['calendar_date'], {
      calendar_date: date,
      start_time: midnight + bed * 60_000,
      end_time: midnight + wake * 60_000,
      sleep_s: (wake - bed) * 60,
      need_actual_min: 480,
      next_need_min: i === nights - 1 ? 510 : 480,
      score: 75,
      deep_pct: 20,
      rem_pct: 15,
      light_pct: 65,
      updated_at: 0,
    });
    upsert(db, 'daily_wellness', ['calendar_date'], {
      calendar_date: date,
      body_battery_charged: 50,
      body_battery_drained: 60,
      body_battery_max: 80,
      stress_avg: weekend ? 15 : 25,
      medium_stress_s: 1800,
      high_stress_s: 600,
      bb_sleep: 45,
      bb_activity: -10,
      updated_at: 0,
    });
  }
  return db;
}

test('a far-off target gets a 30-minute step from the usual bedtime instead', () => {
  // Asleep at 01:30, up at 07:00 on weekdays: 8h30 of need means asleep by 22:30, three hours earlier.
  const { tonight } = getSleepReport(seed(90), dateOf(27)); // Wednesday 28 Oct; Thursday is a weekday
  assert.equal(tonight?.need_h, 8.5);
  assert.equal(tonight?.wake, '07:00');
  assert.equal(tonight?.wake_basis, 'weekday');
  assert.equal(tonight?.asleep_by, '22:30');
  assert.equal(tonight?.usual_bed, '01:30');
  assert.equal(tonight?.step?.asleep_by, '01:00');
  assert.equal(tonight?.step?.in_bed_by, '00:45');
});

test('a target within half an hour of the usual bedtime is given as it is', () => {
  const { tonight } = getSleepReport(seed(-60), dateOf(27)); // asleep at 23:00 usually; target 22:30
  assert.equal(tonight?.step, null);
  assert.equal(tonight?.asleep_by, '22:30');
  assert.equal(tonight?.in_bed_by, '22:15');
});

test('after midnight, before the night is recorded, the plan wakes up today', () => {
  // Friday 30 October, still up: the last recorded night ended Thursday. The wake-up to plan for is Friday's (weekday),
  // not Saturday's.
  const { tonight } = getSleepReport(seed(90, 29), dateOf(29));
  assert.equal(tonight?.wake_day, dateOf(29));
  assert.equal(tonight?.wake_basis, 'weekday');
  const after = getSleepReport(seed(90, 30), dateOf(29)).tonight; // Friday's night recorded: plan for Saturday
  assert.equal(after?.wake_day, dateOf(30));
  assert.equal(after?.wake_basis, 'weekend');
});

test('debt counts only the shortfall of each of the last seven nights', () => {
  const { debt } = getSleepReport(seed(90), dateOf(27)); // weeknights 5h30, weekend nights 7h30, need 8h
  assert.equal(debt?.nights, 7);
  assert.equal(debt?.debt_h, 5 * 2.5 + 2 * 0.5);
  assert.equal(debt?.level, 'high');
});

test('timing: the same bedtime every night is regular; weekend lie-ins show as a later midpoint', () => {
  const { consistency, stages } = getSleepReport(seed(90), dateOf(27));
  assert.equal(consistency?.bed_sd_min, 0);
  assert.equal(consistency?.bed_rating, 'regular');
  assert.equal(consistency?.social_jetlag_min, 60); // wake 2h later, same bedtime: midpoint 1h later
  assert.equal(stages?.rem.status, 'low');
  assert.equal(stages?.deep.status, 'in_range');
});

test('stress report: draining days, where the battery goes, workdays against weekends', () => {
  const report = getStressReport(seed(90), dateOf(27));
  assert.equal(report.balance?.net_avg, -10);
  assert.equal(report.balance?.verdict, 'draining');
  assert.equal(report.sources?.sleep, 45);
  assert.equal(report.sources?.workouts, -10);
  assert.equal(report.sources?.everyday_charge, 5);
  assert.equal(report.sources?.everyday_drain, 50);
  assert.equal(report.week_pattern?.workdays.stress, 25);
  assert.equal(report.week_pattern?.weekends.stress, 15);
  assert.equal(report.week_pattern?.weekends.stressed_min, 40);
  assert.equal(report.stress_time?.recent.medium_min, 30);
});
