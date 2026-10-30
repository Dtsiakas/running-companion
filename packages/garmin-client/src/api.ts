import { toCalendarDate, type DateInput } from './dates.ts';
import type { HttpClient } from './http.ts';

/**
 * Every documented Personal API endpoint. Response types are `unknown` on purpose:
 * Garmin publishes no schemas, so types get written from real responses captured by `npm run discover`.
 *
 * Paths follow Garmin's official client (garmin-connect-personal-api-python).
 */
export class GarminApi {
  readonly #http: HttpClient;

  constructor(http: HttpClient) {
    this.#http = http;
  }

  // Profile ------------------------------------------------------------------

  profileSettings() {
    return this.#http.getJson('/userprofile-service/userprofile/settings');
  }

  heartRateZones() {
    return this.#http.getJson('/biometric-service/heartRateZones/v2');
  }

  fitnessAge(date: DateInput) {
    return this.#http.getJson(`/fitnessage-service/fitnessage/v2/${toCalendarDate(date)}`);
  }

  // Activities -----------------------------------------------------------------

  searchActivities(options: { start?: number; limit?: number; startDate?: DateInput; endDate?: DateInput; activityType?: string } = {}) {
    return this.#http.getJson('/activitylist-service/activities/search/activities', {
      start: options.start ?? 0,
      limit: options.limit ?? 20,
      startDate: options.startDate && toCalendarDate(options.startDate),
      endDate: options.endDate && toCalendarDate(options.endDate),
      activityType: options.activityType,
    });
  }

  activity(activityId: number) {
    return this.#http.getJson(`/activity-service/activity/${positiveId(activityId)}`);
  }

  activityWorkouts(activityId: number) {
    return this.#http.getJson(`/activity-service/activity/${positiveId(activityId)}/workouts`);
  }

  /** The original activity file, delivered as a ZIP containing the .fit file. */
  downloadActivity(activityId: number) {
    return this.#http.getBytes(`/download-service/files/activity/${positiveId(activityId)}`);
  }

  // Daily summaries --------------------------------------------------------------

  dailySummaries(start: DateInput, end: DateInput) {
    return this.#http.getJson('/usersummary-service/v2/dailysummaries', range(start, end));
  }

  dailySteps(start: DateInput, end: DateInput) {
    return this.#http.getJson(`/usersummary-service/stats/steps/daily/${pathRange(start, end)}`);
  }

  dailyStress(start: DateInput, end: DateInput) {
    return this.#http.getJson(`/usersummary-service/stats/stress/daily/${pathRange(start, end)}`);
  }

  dailyHydration(start: DateInput, end: DateInput) {
    return this.#http.getJson(`/usersummary-service/stats/hydration/daily/${pathRange(start, end)}`);
  }

  wellnessActivitySummaries(start: DateInput, end: DateInput) {
    return this.#http.getJson(`/wellnessactivity-service/activity/summary/range/${pathRange(start, end)}`);
  }

  bodyBattery(start: DateInput, end: DateInput) {
    return this.#http.getJson('/wellness-service/wellness/bodyBattery/reports/daily', range(start, end));
  }

  // Sleep, heart, HRV, SpO2 --------------------------------------------------------

  dailySleep(date: DateInput) {
    return this.#http.getJson('/sleep-service/sleep/dailySleep', { date: toCalendarDate(date) });
  }

  sleepSummaries(start: DateInput, end: DateInput) {
    return this.#http.getJson('/sleep-service/sleep/dailySleepSummariesByDate', range(start, end));
  }

  dailyHeartRate(date: DateInput) {
    return this.#http.getJson('/wellness-service/wellness/dailyHeartRate', { date: toCalendarDate(date) });
  }

  hrv(date: DateInput) {
    return this.#http.getJson(`/hrv-service/hrv/${toCalendarDate(date)}`);
  }

  hrvSummaries(start: DateInput, end: DateInput) {
    return this.#http.getJson(`/hrv-service/hrv/daily/${pathRange(start, end)}`);
  }

  spo2(date: DateInput) {
    return this.#http.getJson(`/wellness-service/wellness/daily/spo2acclimation/${toCalendarDate(date)}`);
  }

  // Body composition, goals, nutrition -------------------------------------------------

  weightMeasurements(start: DateInput, end: DateInput) {
    return this.#http.getJson(`/weight-service/weight/range/${pathRange(start, end)}`, { includeAll: true });
  }

  weightGoals(start: DateInput, end: DateInput) {
    return this.#http.getJson(`/goal-service/goal/user/effective/weightgoal/${pathRange(start, end)}`);
  }

  foodLogs(date: DateInput) {
    return this.#http.getJson(`/nutrition-service/food/logs/${toCalendarDate(date)}`);
  }
}

function range(start: DateInput, end: DateInput) {
  return { startDate: toCalendarDate(start), endDate: toCalendarDate(end) };
}

function pathRange(start: DateInput, end: DateInput): string {
  return `${toCalendarDate(start)}/${toCalendarDate(end)}`;
}

function positiveId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid activity id: ${id}`);
  return id;
}
