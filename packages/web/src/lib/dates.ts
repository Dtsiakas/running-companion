import { f, m } from './i18n.ts';

/** Calendar dates are 'YYYY-MM-DD' strings, as the API sends them. Arithmetic in UTC avoids daylight-saving surprises. */
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function weekStartOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((day.getUTCDay() + 6) % 7));
}

export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

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
