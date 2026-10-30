/**
 * How much heat and humidity slow a run, after Mark Hadley's rule used by many running coaches: add the air temperature
 * and the dew point in °F. Up to 100 costs nothing; above that the pace cost rises in steps, and above 180 hard running
 * isn't advisable. Dew point matters as much as temperature because humid air stops sweat from evaporating, which is
 * how the body sheds heat. It's a rule of thumb for an acclimatised runner, not a physiological model.
 *
 * Pure, so the dashboard and the server use the same numbers.
 */

/** [upper bound of the °F sum, pace cost range in %] */
const BANDS: Array<[number, number, number]> = [
  [100, 0, 0],
  [110, 0, 0.5],
  [120, 0.5, 1],
  [130, 1, 2],
  [140, 2, 3],
  [150, 3, 4.5],
  [160, 4.5, 6],
  [170, 6, 8],
  [180, 8, 10],
];

export type HeatLevel = 'none' | 'mild' | 'moderate' | 'high' | 'extreme';

export interface HeatCost {
  /** Temperature plus dew point, °F. */
  sum_f: number;
  /** Estimated pace cost, %, interpolated within the band. */
  pct: number;
  level: HeatLevel;
  /** "Ideal running weather", "Hard running not advised" … */
  label: string;
}

const toF = (c: number) => (c * 9) / 5 + 32;

export function heatCost(tempC: number, dewPointC: number): HeatCost {
  const sum = toF(tempC) + toF(dewPointC);
  const round = (v: number) => Math.round(v * 10) / 10;
  if (sum > 180) return { sum_f: Math.round(sum), pct: 10, level: 'extreme', label: 'Hard running not advised' };
  let lower = -Infinity;
  for (const [upper, low, high] of BANDS) {
    if (sum <= upper) {
      // Interpolate across the band so 101 and 110 don't get the same number.
      const pct = lower === -Infinity ? 0 : low + ((high - low) * (sum - lower)) / (upper - lower);
      return { sum_f: Math.round(sum), pct: round(pct), level: levelOf(pct), label: labelOf(pct) };
    }
    lower = upper;
  }
  return { sum_f: Math.round(sum), pct: 10, level: 'extreme', label: 'Hard running not advised' };
}

function levelOf(pct: number): HeatLevel {
  if (pct <= 0.5) return 'none';
  if (pct <= 2) return 'mild';
  if (pct <= 4.5) return 'moderate';
  if (pct <= 8) return 'high';
  return 'extreme';
}

function labelOf(pct: number): string {
  if (pct <= 0.5) return 'Ideal running weather';
  if (pct <= 2) return 'Slightly warm';
  if (pct <= 4.5) return 'Warm: easy days slower, hard days harder';
  if (pct <= 8) return 'Hot: adjust pace, drink more';
  return 'Very hot: easy running only';
}

/**
 * The same effort in cool weather: a pace (seconds per km) run at `pct` heat cost would have been about this much
 * faster. Applied to speed, so a 3% cost on 5:30/km gives about 5:20/km.
 */
export function coolEquivalentPace(paceSecondsPerKm: number, pct: number): number {
  return paceSecondsPerKm / (1 + pct / 100);
}
