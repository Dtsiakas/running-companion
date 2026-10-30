/**
 * Raw Garmin JSON → table rows. Pure functions: no I/O, so they are easy to test and to re-run
 * over stored raw responses when we add columns later.
 */
import type { Row } from '@companion/db';
import { arr, bool, gmtToMs, int, localDateTime, num, obj, positive, scaled, str, type Json } from './convert.ts';

// Garmin sends some values as 32-bit floats (8.49 arrives as 8.490000152587891), hence rounding to 0.1 mm.
const CM_TO_MM = 10;
const G_TO_KG = 1 / 1000;
const MS_TO_S = 1 / 1000;

// Daily wellness (/usersummary-service/v2/dailysummaries) -------------------------------------------

export function mapDailySummary(day: Json, now: number): Row | null {
  const calendarDate = str(day.calendarDate);
  // Days before the watch existed come back as placeholders without wellness or activity data.
  if (!calendarDate || (day.includesWellnessData !== true && day.includesActivityData !== true)) return null;

  const steps = obj(obj(day.movement).steps);
  const floorsUp = obj(obj(day.movement).floorsAscended);
  const floorsDown = obj(obj(day.movement).floorsDescended);
  const calories = obj(day.calories);
  const heartRate = obj(day.heartRate);
  const intensity = obj(day.intensityMinutes);
  const stress = obj(day.stress);
  const bodyBattery = obj(day.bodyBattery);
  const respiration = obj(day.respiration);
  const pulseOx = obj(day.pulseOx);
  const hydration = obj(day.hydration);

  return {
    calendar_date: calendarDate,
    steps: int(steps.value),
    step_goal: int(steps.goal),
    walking_distance_m: num(steps.distanceInMeters),
    floors_up: int(floorsUp.value),
    floors_down: int(floorsDown.value),
    resting_hr: int(heartRate.restingValue),
    min_hr: int(heartRate.minValue),
    max_hr: int(heartRate.maxValue),
    stress_avg: positiveInt(stress.avgLevel),
    stress_max: positiveInt(stress.maxLevel),
    stress_qualifier: str(stress.qualifier),
    rest_stress_s: scaled(stress.restDurationInMillis, MS_TO_S),
    low_stress_s: scaled(stress.lowStressDurationInMillis, MS_TO_S),
    medium_stress_s: scaled(stress.mediumStressDurationInMillis, MS_TO_S),
    high_stress_s: scaled(stress.highStressDurationInMillis, MS_TO_S),
    body_battery_min: int(bodyBattery.minValue),
    body_battery_max: int(bodyBattery.maxValue),
    body_battery_charged: int(bodyBattery.chargedValue),
    body_battery_drained: int(bodyBattery.drainedValue),
    body_battery_end: int(bodyBattery.latestValue),
    ...bodyBatteryEvents(bodyBattery.activityEvents),
    moderate_intensity_min: int(intensity.moderate),
    vigorous_intensity_min: int(intensity.vigorous),
    intensity_goal_min: int(intensity.goal),
    calories_total: int(calories.burnedTotal),
    calories_active: int(calories.burnedActive),
    calories_resting: int(calories.burnedResting),
    respiration_avg: num(respiration.avgValue),
    respiration_min: num(respiration.minValue),
    respiration_max: num(respiration.maxValue),
    spo2_avg_pct: num(pulseOx.avgValue),
    spo2_min_pct: num(pulseOx.minValue),
    hydration_ml: num(hydration.consumedInMl),
    updated_at: now,
  };
}

const BB_EVENT_COLUMN: Record<string, string> = { SLEEP: 'bb_sleep', NAP: 'bb_nap', ACTIVITY: 'bb_activity', STRESS: 'bb_stress', RECOVERY: 'bb_recovery' };

/** What charged (+) and drained (−) Body Battery that day, summed by cause; null where there was no such event. */
function bodyBatteryEvents(events: unknown): Row {
  const sums: Row = { bb_sleep: null, bb_nap: null, bb_activity: null, bb_stress: null, bb_recovery: null };
  for (const event of arr(events)) {
    const column = BB_EVENT_COLUMN[str(obj(event).eventType) ?? ''];
    const impact = int(obj(event).bodyBatteryImpact);
    if (column && impact !== null) sums[column] = (Number(sums[column] ?? 0)) + impact;
  }
  return sums;
}

// Garmin uses negative stress values for "not enough data".
function positiveInt(value: unknown): number | null {
  const n = int(value);
  return n !== null && n >= 0 ? n : null;
}

// Sleep (/sleep-service/sleep/dailySleepSummariesByDate) ---------------------------------------------

export function mapSleep(night: Json, now: number): Row | null {
  const calendarDate = str(night.calendarDate);
  // Tonight (not slept yet) comes back as a row of nulls.
  if (!calendarDate || num(night.sleepTimeSeconds) === null) return null;

  const scores = obj(night.sleepScores);
  const need = obj(night.sleepNeed);

  return {
    calendar_date: calendarDate,
    start_time: num(night.sleepStartTimestampGMT),
    end_time: num(night.sleepEndTimestampGMT),
    sleep_s: num(night.sleepTimeSeconds),
    deep_s: num(night.deepSleepSeconds),
    light_s: num(night.lightSleepSeconds),
    rem_s: num(night.remSleepSeconds),
    awake_s: num(night.awakeSleepSeconds),
    nap_s: num(night.napTimeSeconds),
    awake_count: int(night.awakeCount),
    score: int(obj(scores.overall).value),
    score_qualifier: str(obj(scores.overall).qualifierKey),
    duration_qualifier: str(obj(scores.totalDuration).qualifierKey),
    stress_qualifier: str(obj(scores.stress).qualifierKey),
    deep_pct: num(obj(scores.deepPercentage).value),
    light_pct: num(obj(scores.lightPercentage).value),
    rem_pct: num(obj(scores.remPercentage).value),
    avg_hr: int(night.avgHeartRate),
    avg_sleep_stress: num(night.avgSleepStress),
    avg_spo2_pct: num(night.averageSpO2Value),
    lowest_spo2_pct: num(night.lowestSpO2Value),
    avg_respiration: num(night.averageRespirationValue),
    lowest_respiration: num(night.lowestRespirationValue),
    highest_respiration: num(night.highestRespirationValue),
    need_baseline_min: int(need.baseline),
    need_actual_min: int(need.actual),
    need_feedback: str(need.feedback),
    next_need_min: int(obj(night.nextSleepNeed).actual),
    score_feedback: str(night.sleepScoreFeedback),
    score_insight: str(night.sleepScoreInsight),
    breathing_disruption: str(night.breathingDisruptionSeverity),
    updated_at: now,
  };
}

// HRV (/hrv-service/hrv/daily/{start}/{end}) --------------------------------------------------------------

export function mapHrv(summary: Json, now: number): Row | null {
  const calendarDate = str(summary.calendarDate);
  if (!calendarDate || num(summary.lastNightAvg) === null) return null;
  const baseline = obj(summary.baseline);

  return {
    calendar_date: calendarDate,
    last_night_avg_ms: num(summary.lastNightAvg),
    last_night_5min_high_ms: num(summary.lastNight5MinHigh),
    weekly_avg_ms: num(summary.weeklyAvg),
    baseline_low_upper_ms: num(baseline.lowUpper),
    baseline_balanced_low_ms: num(baseline.balancedLow),
    baseline_balanced_upper_ms: num(baseline.balancedUpper),
    status: str(summary.status),
    feedback: str(summary.feedbackPhrase),
    updated_at: now,
  };
}

// Weigh-ins (/weight-service/weight/range) -----------------------------------------------------------------

export function mapWeighIns(response: Json, now: number): Row[] {
  const rows: Row[] = [];
  for (const day of arr(response.dailyWeightSummaries)) {
    for (const sample of arr(day.allWeightMetrics)) {
      const samplePk = num(sample.samplePk);
      const weightKg = scaled(positive(sample.weight), G_TO_KG);
      const measuredAt = num(sample.timestampGMT) ?? num(sample.date);
      const calendarDate = str(sample.calendarDate);
      if (samplePk === null || weightKg === null || measuredAt === null || !calendarDate) continue;

      rows.push({
        sample_pk: samplePk,
        measured_at: measuredAt,
        calendar_date: calendarDate,
        weight_kg: weightKg,
        bmi: positive(sample.bmi),
        body_fat_pct: positive(sample.bodyFat),
        body_water_pct: positive(sample.bodyWater),
        muscle_mass_kg: scaled(positive(sample.muscleMass), G_TO_KG),
        bone_mass_kg: scaled(positive(sample.boneMass), G_TO_KG),
        visceral_fat: positive(sample.visceralFat),
        metabolic_age: int(positive(sample.metabolicAge)),
        source: str(sample.sourceType),
        updated_at: now,
      });
    }
  }
  return rows;
}

// Activities --------------------------------------------------------------------------------------------------

/** From the activity search list. Partial row: detail and FIT fields are filled in by later steps. */
export function mapActivityListItem(item: Json, now: number): Row | null {
  const activityId = num(item.activityId);
  const startTime = gmtToMs(item.startTimeGMT);
  const startLocal = localDateTime(item.startTimeLocal);
  const type = obj(item.activityType);
  const typeKey = str(type.typeKey);
  if (activityId === null || startTime === null || !startLocal || !typeKey) return null;

  return {
    activity_id: activityId,
    name: str(item.activityName),
    type_key: typeKey,
    parent_type_id: int(type.parentTypeId),
    start_time: startTime,
    start_time_local: startLocal,
    calendar_date: startLocal.slice(0, 10),
    location_name: str(item.locationName),
    is_pr: bool(item.pr ?? item.isPR),

    distance_m: num(item.distance),
    duration_s: num(item.duration),
    moving_duration_s: num(item.movingDuration),
    elapsed_duration_s: num(item.elapsedDuration),
    elevation_gain_m: num(item.elevationGain),
    elevation_loss_m: num(item.elevationLoss),
    avg_speed_mps: num(item.averageSpeed),
    max_speed_mps: num(item.maxSpeed),
    avg_gap_speed_mps: num(item.avgGradeAdjustedSpeed),
    steps: int(item.steps),
    calories: int(item.calories),
    water_estimated_ml: num(item.waterEstimated),

    avg_hr: int(item.averageHR),
    max_hr: int(item.maxHR),
    avg_cadence_spm: num(item.averageRunningCadenceInStepsPerMinute),
    max_cadence_spm: num(item.maxRunningCadenceInStepsPerMinute),
    avg_power_w: num(item.avgPower),
    max_power_w: num(item.maxPower),
    norm_power_w: num(item.normPower),
    avg_gct_ms: num(item.avgGroundContactTime),
    avg_vertical_oscillation_mm: scaled(item.avgVerticalOscillation, CM_TO_MM, 1),
    avg_vertical_ratio_pct: num(item.avgVerticalRatio),
    avg_step_length_mm: scaled(item.avgStrideLength, CM_TO_MM, 1),
    min_temp_c: num(item.minTemperature),
    max_temp_c: num(item.maxTemperature),

    aerobic_te: num(item.aerobicTrainingEffect),
    anaerobic_te: num(item.anaerobicTrainingEffect),
    te_label: str(item.trainingEffectLabel),
    training_load: num(item.activityTrainingLoad),
    moderate_intensity_min: int(item.moderateIntensityMinutes),
    vigorous_intensity_min: int(item.vigorousIntensityMinutes),
    body_battery_delta: int(item.differenceBodyBattery),

    hr_zone1_s: num(item.hrTimeInZone_1),
    hr_zone2_s: num(item.hrTimeInZone_2),
    hr_zone3_s: num(item.hrTimeInZone_3),
    hr_zone4_s: num(item.hrTimeInZone_4),
    hr_zone5_s: num(item.hrTimeInZone_5),
    power_zone1_s: num(item.powerTimeInZone_1),
    power_zone2_s: num(item.powerTimeInZone_2),
    power_zone3_s: num(item.powerTimeInZone_3),
    power_zone4_s: num(item.powerTimeInZone_4),
    power_zone5_s: num(item.powerTimeInZone_5),
    fastest_1k_s: num(item.fastestSplit_1000),
    fastest_mile_s: num(item.fastestSplit_1609),
    fastest_5k_s: num(item.fastestSplit_5000),
    updated_at: now,
  };
}

/** Extra fields only present in /activity-service/activity/{id}. */
export function mapActivityDetail(detail: Json): Row {
  const summary = obj(detail.summaryDTO);
  return {
    min_hr: int(summary.minHR),
    avg_temp_c: num(summary.averageTemperature),
    // Garmin stores RPE ×10 (40 = RPE 4).
    rpe: scaled(summary.directWorkoutRpe, 1 / 10),
    feel: int(summary.directWorkoutFeel),
    compliance_score: int(summary.directWorkoutComplianceScore),
    stamina_start_pct: num(summary.beginPotentialStamina),
    stamina_end_pct: num(summary.endPotentialStamina),
  };
}

export function mapWorkoutName(workouts: unknown): string | null {
  return str(arr(workouts)[0]?.workoutName);
}

// Profile ----------------------------------------------------------------------------------------------------

export interface ProfileSources {
  settings: unknown;
  heartRateZones: unknown;
  fitnessAge: unknown;
  weightGoals: unknown;
}

export function mapProfileSnapshot(calendarDate: string, sources: ProfileSources, now: number): Row {
  const zones = arr(sources.heartRateZones).find((zone) => zone.sport === 'DEFAULT') ?? arr(sources.heartRateZones)[0] ?? {};
  const fitnessAge = obj(sources.fitnessAge);
  const weightGoal = arr(obj(sources.weightGoals).userGoals).find((goal) => goal.userGoalType === 'WEIGHT_GRAMS');

  return {
    calendar_date: calendarDate,
    max_hr: int(zones.maxHeartRateUsed),
    resting_hr_used: int(zones.restingHeartRateUsed),
    lactate_threshold_hr: int(zones.lactateThresholdHeartRateUsed),
    hr_zone_method: str(zones.trainingMethod),
    hr_zone1_floor: int(zones.zone1Floor),
    hr_zone2_floor: int(zones.zone2Floor),
    hr_zone3_floor: int(zones.zone3Floor),
    hr_zone4_floor: int(zones.zone4Floor),
    hr_zone5_floor: int(zones.zone5Floor),
    fitness_age: num(fitnessAge.fitnessAge),
    chronological_age: int(fitnessAge.chronologicalAge),
    weight_goal_kg: scaled(weightGoal?.goalValue, G_TO_KG),
    time_zone: str(obj(sources.settings).timeZone),
    updated_at: now,
  };
}
