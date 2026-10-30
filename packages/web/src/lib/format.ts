/** Formatting for numbers the API sends raw (speeds, seconds), plus the names of things. */

/** Speed in m/s as pace "5:22" (per km). Below 1.5 m/s (slower than 11:06/km) is walking or standing, not running pace. */
export function paceFromSpeed(speedMps: number | null | undefined): string {
  if (!speedMps || speedMps < 1.5) return '–';
  return clock(1000 / speedMps);
}

/** Seconds as "4:21" or "1:02:05". */
export function clock(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Seconds per km between an actual speed and the nearest edge of a target speed range, in whole seconds as displayed. */
export function paceGap(speedMps: number, [low, high]: [number, number]): number {
  const pace = Math.round(1000 / speedMps);
  const fastEdge = Math.round(1000 / high);
  const slowEdge = Math.round(1000 / low);
  return pace < fastEdge ? fastEdge - pace : pace > slowEdge ? pace - slowEdge : 0;
}

export const CATEGORY_LABEL: Record<string, string> = {
  easy: 'Easy',
  long: 'Long run',
  recovery: 'Recovery',
  tempo: 'Tempo',
  threshold: 'Threshold',
  intervals: 'Intervals',
  sprint: 'Sprints',
  test: 'Test',
  other: 'Other',
};

export const STEP_LABEL: Record<string, string> = {
  warmup: 'Warm-up',
  active: 'Run',
  interval: 'Interval',
  recovery: 'Recovery',
  rest: 'Rest',
  cooldown: 'Cool-down',
};
