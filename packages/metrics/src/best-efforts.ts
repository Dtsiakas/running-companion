export const BEST_EFFORT_DISTANCES_M = [400, 1000, 1609.344, 3000, 5000, 10000, 21097.5, 42195] as const;

export interface DistancePoint {
  /** Seconds of timer time since the start (pauses removed, see toDistancePoints). */
  t: number;
  /** Cumulative distance in metres. */
  d: number;
}

/**
 * Fastest time to cover each distance anywhere within the activity, using a sliding window over the
 * cumulative distance stream: O(n) per distance. The window's time is pro-rated to the exact distance,
 * because consecutive samples rarely land exactly on it.
 * Times are timer time, as on Garmin: the caller removes pauses from the stream.
 */
export function bestEfforts(points: DistancePoint[], distances: readonly number[] = BEST_EFFORT_DISTANCES_M): Map<number, number> {
  const result = new Map<number, number>();
  if (points.length < 2) return result;
  const total = points.at(-1)!.d - points[0]!.d;

  for (const target of distances) {
    if (total < target) continue;
    let best = Infinity;
    let start = 0;
    for (let end = 1; end < points.length; end++) {
      // Advance the start while the window would still cover the target distance without it.
      while (start + 1 < end && points[end]!.d - points[start + 1]!.d >= target) start++;
      const covered = points[end]!.d - points[start]!.d;
      if (covered >= target) {
        const seconds = ((points[end]!.t - points[start]!.t) * target) / covered;
        if (seconds < best) best = seconds;
      }
    }
    if (Number.isFinite(best)) result.set(target, best);
  }
  return result;
}
