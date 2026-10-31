import { ENGLISH, type I18n } from '@companion/i18n';
import type { DatabaseSync } from 'node:sqlite';
import { round } from './format.ts';
import { addDays, mondayOf } from '@companion/dates';

type Row = Record<string, unknown>;
const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const s = (value: unknown) => (value === null || value === undefined ? null : String(value));
const hours = (seconds: unknown) => round((n(seconds) ?? NaN) / 3600, 2);


/** The user's time zone from their Garmin profile; sleep times are stored in UTC. */
function timeZone(db: DatabaseSync): string | undefined {
  const row = db.prepare('SELECT time_zone FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as Row | undefined;
  return s(row?.time_zone) ?? undefined;
}

function clockTime(epochMs: unknown, zone: string | undefined): string | null {
  const ms = n(epochMs);
  return ms === null ? null : new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: zone });
}

/**
 * Everything about one day beyond training: last night's sleep in detail, energy and stress, everyday activity.
 *
 * Which day each value comes from matters, because the Today screen is read in the morning:
 * - sleep: the night that ended on `date` (Garmin files a night under the morning you wake up);
 * - Body Battery: today's peak, which is where the night's recharge left you (it only drains from there);
 * - stress: yesterday, the last complete day; today's average would be based on a few hours;
 * - steps and calories: today so far, plus yesterday complete;
 * - intensity minutes: this Monday-to-Sunday week, counted the way Garmin and the WHO do (vigorous minutes count double).
 */
export function getDay(db: DatabaseSync, date: string) {
  const zone = timeZone(db);
  const sleep = db.prepare('SELECT * FROM sleep WHERE calendar_date = ?').get(date) as Row | undefined;
  const today = db.prepare('SELECT * FROM daily_wellness WHERE calendar_date = ?').get(date) as Row | undefined;
  const yesterday = db.prepare('SELECT * FROM daily_wellness WHERE calendar_date = ?').get(addDays(date, -1)) as Row | undefined;
  const week = db
    .prepare(
      `SELECT SUM(COALESCE(moderate_intensity_min, 0) + 2 * COALESCE(vigorous_intensity_min, 0)) AS minutes, MAX(intensity_goal_min) AS goal
       FROM daily_wellness WHERE calendar_date BETWEEN ? AND ?`,
    )
    .get(mondayOf(date), date) as Row;

  return {
    sleep: sleep
      ? {
          score: n(sleep.score),
          score_qualifier: s(sleep.score_qualifier),
          hours: hours(sleep.sleep_s),
          bedtime: clockTime(sleep.start_time, zone),
          wake_time: clockTime(sleep.end_time, zone),
          stages_h: { deep: hours(sleep.deep_s), light: hours(sleep.light_s), rem: hours(sleep.rem_s), awake: hours(sleep.awake_s) },
          awake_count: n(sleep.awake_count),
          avg_sleep_stress: round(n(sleep.avg_sleep_stress)),
          breathing_rate: round(n(sleep.avg_respiration)),
          spo2_avg_pct: round(n(sleep.avg_spo2_pct), 0),
          spo2_lowest_pct: round(n(sleep.lowest_spo2_pct), 0),
          /** Garmin's own codes for the night, e.g. POSITIVE_DEEP, NEGATIVE_LATE_BED_TIME. */
          garmin_feedback: [s(sleep.score_feedback), s(sleep.score_insight)].filter((x): x is string => !!x && x !== 'NONE'),
        }
      : null,
    energy: {
      body_battery_morning: n(today?.body_battery_max),
      body_battery_charged_today: n(today?.body_battery_charged),
      stress_yesterday_avg: n(yesterday?.stress_avg),
      stress_yesterday_high_min: round((n(yesterday?.high_stress_s) ?? NaN) / 60, 0),
    },
    activity: {
      steps_today: n(today?.steps),
      steps_yesterday: n(yesterday?.steps),
      step_goal: n(today?.step_goal ?? yesterday?.step_goal),
      calories_yesterday: n(yesterday?.calories_total),
      active_calories_yesterday: n(yesterday?.calories_active),
      intensity_minutes_week: n(week.minutes),
      intensity_goal_week: n(week.goal),
    },
  };
}

/** Labels for Garmin's fitness age components. */
const FITNESS_AGE_COMPONENTS: Record<string, { label: string; unit: string }> = {
  bodyFat: { label: 'Body fat', unit: '%' },
  bmi: { label: 'BMI', unit: '' },
  rhr: { label: 'Resting heart rate', unit: 'bpm' },
  vigorousDaysAvg: { label: 'Vigorous days per week', unit: '' },
  vigorousMinutesAvg: { label: 'Vigorous minutes per week', unit: 'min' },
};

/**
 * Garmin's fitness age and what drives it, from the latest stored response. Each component says where you are and,
 * when Garmin suggests one, the target and the age you could reach. Garmin's own priority marks the biggest lever.
 */
export function getFitnessAge(db: DatabaseSync, i18n: I18n = ENGLISH) {
  const raw = db.prepare(`SELECT body FROM raw_responses WHERE endpoint = 'fitness-age' ORDER BY fetched_at DESC LIMIT 1`).get() as Row | undefined;
  const goal = db.prepare('SELECT weight_goal_kg FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as Row | undefined;
  if (!raw) return null;
  const body = JSON.parse(String(raw.body)) as {
    chronologicalAge?: number;
    fitnessAge?: number;
    achievableFitnessAge?: number;
    components?: Record<string, { value?: number; targetValue?: number; potentialAge?: number; priority?: number }>;
  };
  const components = Object.entries(body.components ?? {})
    .filter(([key]) => key in FITNESS_AGE_COMPONENTS)
    .map(([key, c]) => ({
      key,
      label: i18n.m.body.fitnessComponents[key] ?? FITNESS_AGE_COMPONENTS[key]!.label,
      unit: FITNESS_AGE_COMPONENTS[key]!.unit,
      value: round(c.value, 1),
      target: round(c.targetValue, 1),
      potential_age: round(c.potentialAge, 0),
      priority: c.priority ?? null,
    }))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return {
    fitness_age: round(body.fitnessAge, 0),
    actual_age: body.chronologicalAge ?? null,
    achievable_age: round(body.achievableFitnessAge, 0),
    /** The component Garmin ranks first, if it has a target: where improving helps most. */
    biggest_lever: components.find((c) => c.priority === 1 && c.target !== null) ?? null,
    components,
    weight_goal_kg: round(n(goal?.weight_goal_kg), 1),
  };
}
