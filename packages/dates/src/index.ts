/**
 * Calendar dates as 'YYYY-MM-DD' strings, the form the database, the API and the dashboard all use.
 *
 * Arithmetic is done in UTC on purpose: a calendar date has no time zone, and local-time arithmetic breaks on
 * daylight-saving days (a "day" can be 23 or 25 hours). Only "today" depends on a time zone, so that's explicit.
 * Shared by the server, the dashboard, the connector and the sync, which each had their own copy.
 */
export type CalendarDate = string;

const utc = (date: CalendarDate) => Date.parse(`${date}T00:00:00Z`);

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(utc(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Days from `from` to `to`: 0 for the same day, negative when `to` is earlier. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: CalendarDate): number {
  return (new Date(utc(date)).getUTCDay() + 6) % 7;
}

/** The Monday of the week `date` falls in (weeks run Monday to Sunday, as in Garmin Connect). */
export function mondayOf(date: CalendarDate): CalendarDate {
  return addDays(date, -weekday(date));
}

/** A real date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/** Today in a time zone (an IANA name such as Europe/Athens), or this machine's when none is given. */
export function today(timeZone?: string, now: Date = new Date()): CalendarDate {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(now);
}
