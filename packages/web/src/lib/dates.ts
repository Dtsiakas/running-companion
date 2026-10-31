import { f, m } from './i18n.ts';

/** Calendar dates are 'YYYY-MM-DD' strings, as the API sends them; see @companion/dates. */
export { addDays, mondayOf as weekStartOf, today as todayLocal } from '@companion/dates';

// Display: in the reader's language (see lib/i18n.ts).

/** "Thursday 29 October" */
export const longDay = (date: string) => f.longDay(date);

/** "Thu 29 Oct" */
export const shortDay = (date: string) => f.shortDay(date);

/** "Mon" */
export const weekday = (date: string) => f.weekday(date);

/** "26 Oct – 1 Nov 2026" */
export const weekRange = (start: string, end: string) => f.weekRange(start, end);

/** "14:06" today, "Wed 14:06" otherwise */
export function syncedAt(iso: string | null | undefined): string {
  if (!iso) return m.app.sync.never;
  const at = new Date(iso);
  const time = f.time(at);
  return at.toDateString() === new Date().toDateString() ? time : `${f.weekday(todayOf(at))} ${time}`;
}

const todayOf = (at: Date) => `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

export const hoursMinutes = (hours: number | null | undefined) => f.hoursMinutes(hours);
