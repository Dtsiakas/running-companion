/**
 * Calendar-date arithmetic on 'YYYY-MM-DD' strings. Done in UTC on purpose: a calendar date has no
 * time zone, and local-time arithmetic breaks on daylight-saving days (a "day" can be 23 or 25 hours).
 */
export type CalendarDate = string;

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive number of days from `start` to `end`. */
export function daysBetween(start: CalendarDate, end: CalendarDate): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export const maxDate = (a: CalendarDate, b: CalendarDate) => (a > b ? a : b);
export const minDate = (a: CalendarDate, b: CalendarDate) => (a < b ? a : b);

/** Today in the machine's local time zone. */
export function localToday(): CalendarDate {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
