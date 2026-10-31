/** The sync's date helpers, on top of @companion/dates (which explains why everything is done in UTC). */
import { addDays, daysBetween as difference, today, type CalendarDate } from '@companion/dates';

export { addDays, type CalendarDate };

/** Inclusive number of days from `start` to `end` (a range of one day is 1). */
export function daysBetween(start: CalendarDate, end: CalendarDate): number {
  return difference(start, end) + 1;
}

export const maxDate = (a: CalendarDate, b: CalendarDate) => (a > b ? a : b);
export const minDate = (a: CalendarDate, b: CalendarDate) => (a < b ? a : b);

/** Today in the machine's local time zone. */
export const localToday = (): CalendarDate => today();
