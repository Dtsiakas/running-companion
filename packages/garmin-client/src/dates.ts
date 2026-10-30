/** A calendar date as Garmin expects it: `YYYY-MM-DD` in the user's local time zone. */
export type CalendarDate = string;

export type DateInput = CalendarDate | Date;

export function toCalendarDate(input: DateInput): CalendarDate {
  if (typeof input === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error(`Expected YYYY-MM-DD, got "${input}"`);
    return input;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${input.getFullYear()}-${pad(input.getMonth() + 1)}-${pad(input.getDate())}`;
}

export function daysAgo(days: number, from: Date = new Date()): Date {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
}
