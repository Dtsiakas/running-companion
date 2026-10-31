/**
 * Two or three round ticks inside the range (four when three can't be round): 5:00 and 6:00 rather than 5:06 and 6:06, 140 and 160 rather than 143 and
 * 161. Recharts' own "nice" ticks can fall outside a clipped range, so they're chosen here. Paces step in whole
 * seconds-of-a-minute (15 s, 30 s, 1 min, 2 min…); everything else in 1, 2 or 5 times a power of ten.
 */
export function roundTicks(domain: [number, number] | ['auto', 'auto'], time = false): number[] | undefined {
  if (typeof domain[0] !== 'number' || typeof domain[1] !== 'number') return undefined;
  const [low, high] = domain;
  const span = high - low;
  if (span <= 0) return [low];
  const steps = time
    ? [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
    : [-2, -1, 0, 1, 2, 3, 4].flatMap((power) => [1, 2, 5].map((unit) => unit * 10 ** power));
  const count = (step: number) => Math.floor(high / step) - Math.ceil(low / step) + 1;
  // The smallest step that gives at most three ticks; if that leaves fewer than two, the step before it.
  const index = steps.findIndex((candidate) => count(candidate) <= 3);
  if (index === -1) return [low, high];
  const step = count(steps[index]!) >= 2 || index === 0 ? steps[index]! : steps[index - 1]!;
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high + 1e-9; tick += step) ticks.push(Number(tick.toFixed(6)));
  return ticks.length >= 2 ? ticks : [low, high];
}
