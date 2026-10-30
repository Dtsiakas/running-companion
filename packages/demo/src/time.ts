/** Calendar dates (YYYY-MM-DD) and wall-clock times in a named time zone, without a date library. */

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Day of the year, 1–366. */
export function dayOfYear(date: string): number {
  return daysBetween(`${date.slice(0, 4)}-01-01`, date) + 1;
}

/** How far `timeZone` is ahead of UTC at that instant, in minutes. */
function offsetMinutes(epoch: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(epoch))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - epoch) / 60_000);
}

/** Epoch milliseconds of a wall-clock time ('YYYY-MM-DDTHH:MM:SS') in a time zone. */
export function zonedEpoch(local: string, timeZone: string): number {
  const guess = Date.parse(`${local}Z`);
  const first = guess - offsetMinutes(guess, timeZone) * 60_000;
  // Near a daylight-saving change the offset at the guess and at the answer can differ: use the answer's.
  return guess - offsetMinutes(first, timeZone) * 60_000;
}

/** The wall-clock time of an instant in a time zone, 'YYYY-MM-DDTHH:MM:SS'. */
export function zonedLocal(epoch: number, timeZone: string): string {
  return new Date(epoch + offsetMinutes(epoch, timeZone) * 60_000).toISOString().slice(0, 19);
}

/** Today's date in a time zone. */
export function todayIn(timeZone: string, now = Date.now()): string {
  return zonedLocal(now, timeZone).slice(0, 10);
}

export const clockTime = (minutesAfterMidnight: number) => {
  const total = Math.round(minutesAfterMidnight * 60);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
};
