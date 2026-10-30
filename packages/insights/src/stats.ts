/**
 * The statistics behind "what works for you": enough to tell a real difference between two groups of days from
 * chance, without a library. Welch's t-test (which doesn't assume both groups vary equally) for the p-value,
 * Cohen's d for the size of the difference.
 */

export interface Summary {
  n: number;
  mean: number;
  sd: number;
}

export function summarize(values: number[]): Summary {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  return { n, mean, sd };
}

export interface Comparison {
  a: Summary;
  b: Summary;
  /** a.mean − b.mean */
  difference: number;
  /** Two-sided p-value: the chance of a difference at least this big if there were no real difference. */
  p: number;
  /** Cohen's d: the difference in pooled standard deviations. About 0.2 is small, 0.5 medium, 0.8 large. */
  d: number;
}

export function compare(a: number[], b: number[]): Comparison | null {
  const sa = summarize(a);
  const sb = summarize(b);
  if (sa.n < 2 || sb.n < 2) return null;
  const va = sa.sd ** 2 / sa.n;
  const vb = sb.sd ** 2 / sb.n;
  const difference = sa.mean - sb.mean;
  if (va + vb === 0) return { a: sa, b: sb, difference, p: difference === 0 ? 1 : 0, d: difference === 0 ? 0 : Infinity };
  const t = difference / Math.sqrt(va + vb);
  // Welch–Satterthwaite degrees of freedom.
  const df = (va + vb) ** 2 / (va ** 2 / (sa.n - 1) + vb ** 2 / (sb.n - 1));
  const pooled = Math.sqrt(((sa.n - 1) * sa.sd ** 2 + (sb.n - 1) * sb.sd ** 2) / (sa.n + sb.n - 2));
  return { a: sa, b: sb, difference, p: twoSidedP(t, df), d: pooled ? difference / pooled : 0 };
}

/** P(|T| ≥ |t|) for Student's t with df degrees of freedom: I_{df/(df+t²)}(df/2, 1/2). */
export function twoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}

/** Regularized incomplete beta function I_x(a, b), by continued fraction (Numerical Recipes, betai/betacf). */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaFraction(x, a, b)) / a : 1 - (front * betaFraction(1 - x, b, a)) / b;
}

function betaFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < 1e-10) break;
  }
  return h;
}

/** ln Γ(x), Lanczos approximation. */
function logGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const coefficient of g) series += coefficient / ++y;
  return -tmp + Math.log((2.5066282746310005 * series) / x);
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  return sorted[low]! + (sorted[Math.ceil(index)]! - sorted[low]!) * (index - low);
}
