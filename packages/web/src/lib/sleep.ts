import { f } from './i18n.ts';

/** "6h 36m" from decimal hours. */
export const hoursText = (hours: number) => f.hours(hours);

/** "23:38" → −22, "02:15" → 135: the same continuous scale as the sleep report's bedtimes. */
export function minutesFromClock(clock: string): number {
  const [h, m] = clock.split(':').map(Number) as [number, number];
  const minutes = h * 60 + m;
  return minutes >= 12 * 60 ? minutes - 24 * 60 : minutes;
}

/** "3h 07m" or "45 min" for a span of minutes. */
export const spanText = (minutes: number) => f.span(minutes);
