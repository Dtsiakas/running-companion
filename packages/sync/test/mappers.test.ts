import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapActivityDetail, mapActivityListItem, mapDailySummary, mapSleep, mapWeighIns } from '@companion/sync';

test('weigh-ins: grams become kg and unmeasured (0) values become null', () => {
  const rows = mapWeighIns(
    {
      dailyWeightSummaries: [
        {
          allWeightMetrics: [
            { samplePk: 1, calendarDate: '2026-10-28', timestampGMT: 1000, weight: 72379, bodyFat: 17.8, muscleMass: 32099, boneMass: 0, sourceType: 'INDEX_SCALE' },
            { samplePk: 2, calendarDate: '2026-10-27', timestampGMT: 900, weight: 0 }, // no weight: skipped
          ],
        },
      ],
    },
    0,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.weight_kg, 72.379);
  assert.equal(rows[0]!.muscle_mass_kg, 32.099);
  assert.equal(rows[0]!.bone_mass_kg, null);
  assert.equal(rows[0]!.body_fat_pct, 17.8);
});

test('sleep: the empty placeholder for tonight is skipped', () => {
  assert.equal(mapSleep({ calendarDate: null, sleepTimeSeconds: null }, 0), null);
  const row = mapSleep({ calendarDate: '2026-10-28', sleepTimeSeconds: 19500, sleepScores: { overall: { value: 71, qualifierKey: 'FAIR' } } }, 0)!;
  assert.equal(row.score, 71);
  assert.equal(row.score_qualifier, 'FAIR');
});

test('daily summary: days without data are skipped, negative stress means unknown', () => {
  assert.equal(mapDailySummary({ calendarDate: '2010-01-01', includesWellnessData: false }, 0), null);
  const row = mapDailySummary({ calendarDate: '2026-10-22', includesWellnessData: true, stress: { avgLevel: -1 }, movement: { steps: { value: 23696 } } }, 0)!;
  assert.equal(row.steps, 23696);
  assert.equal(row.stress_avg, null);
});

test('activity list item: GMT time, local date and cm → mm conversions', () => {
  const row = mapActivityListItem(
    {
      activityId: 24871272519,
      startTimeGMT: '2026-10-27 16:01:11',
      startTimeLocal: '2026-10-27 18:01:11',
      activityType: { typeKey: 'running', parentTypeId: 17 },
      avgVerticalOscillation: 8.49,
      avgStrideLength: 111.53,
    },
    0,
  )!;
  assert.equal(row.start_time, Date.UTC(2026, 9, 27, 16, 1, 11));
  assert.equal(row.calendar_date, '2026-10-27');
  assert.equal(row.start_time_local, '2026-10-27T18:01:11');
  assert.equal(row.avg_vertical_oscillation_mm, 84.9);
  assert.equal(row.avg_step_length_mm, 1115.3);
});

test('activity detail: RPE is stored ×10 by Garmin', () => {
  const row = mapActivityDetail({ summaryDTO: { directWorkoutRpe: 40, directWorkoutFeel: 75 } });
  assert.equal(row.rpe, 4);
  assert.equal(row.feel, 75);
});

test('daily summary: Body Battery events are summed by cause, and missing causes stay null', () => {
  const row = mapDailySummary(
    {
      calendarDate: '2026-10-22',
      includesWellnessData: true,
      bodyBattery: {
        activityEvents: [
          { eventType: 'SLEEP', bodyBatteryImpact: 56 },
          { eventType: 'RECOVERY', bodyBatteryImpact: -2 },
          { eventType: 'ACTIVITY', bodyBatteryImpact: -11 },
          { eventType: 'ACTIVITY', bodyBatteryImpact: -4 },
          { eventType: 'SOMETHING_NEW', bodyBatteryImpact: 9 },
        ],
      },
    },
    0,
  )!;
  assert.equal(row.bb_sleep, 56);
  assert.equal(row.bb_activity, -15);
  assert.equal(row.bb_recovery, -2);
  assert.equal(row.bb_nap, null);
  assert.equal(row.bb_stress, null);
});

test('sleep: the next night’s need is kept for the suggested bedtime', () => {
  const row = mapSleep({ calendarDate: '2026-10-28', sleepTimeSeconds: 19_440, sleepNeed: { actual: 530 }, nextSleepNeed: { actual: 540 } }, 0)!;
  assert.equal(row.need_actual_min, 530);
  assert.equal(row.next_need_min, 540);
});
