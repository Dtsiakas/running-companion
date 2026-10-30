/**
 * A seeded random number generator (mulberry32), so the same seed always produces the same demo runner:
 * screenshots and tests don't change from one run to the next.
 */
export interface Random {
  /** 0 ≤ x < 1 */
  next(): number;
  /** Uniform between low and high. */
  between(low: number, high: number): number;
  /** Normal distribution. */
  normal(mean?: number, sd?: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export function seeded(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  const normal = (mean = 0, sd = 1) => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return mean + sd * value;
    }
    // Box–Muller: two uniform numbers give two independent normal ones.
    const u = Math.max(next(), 1e-12);
    const v = next();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return mean + sd * radius * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    between: (low, high) => low + (high - low) * next(),
    normal,
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)]!,
  };
}
