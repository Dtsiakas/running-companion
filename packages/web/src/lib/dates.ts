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

const asDate = (date: string) => new Date(`${date}T12:00:00`);

/** "Thursday 29 October" */
export const longDay = (date: string) => asDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** "Thu 29 Oct" */
export const shortDay = (date: string) => asDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Mon" */
export const weekday = (date: string) => asDate(date).toLocaleDateString('en-GB', { weekday: 'short' });

/** "26 Oct – 1 Nov 2026" */
export function weekRange(start: string, end: string): string {
  const s = asDate(start);
  const e = asDate(end);
  const sameMonth = s.getMonth() === e.getMonth();
  const from = s.toLocaleDateString('en-GB', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${from} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** "14:06" today, "Wed 14:06" otherwise */
export function syncedAt(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString() ? time : `${at.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
}

export function hoursMinutes(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '–';
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}`;
}
