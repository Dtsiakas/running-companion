/** Small, defensive converters: Garmin fields can be missing, null, NaN or the wrong type. */

export type Json = Record<string, unknown>;

export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function int(value: unknown): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n);
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function bool(value: unknown): number | null {
  return typeof value === 'boolean' ? (value ? 1 : 0) : null;
}

/**
 * Multiplies when the value exists. Used for unit conversion, e.g. grams → kg is `scaled(g, 1 / 1000)`.
 * Rounded to 6 decimals to drop floating-point noise (32099 / 1000 is 32.099000000000004 in binary floats).
 */
export function scaled(value: unknown, factor: number, decimals = 6): number | null {
  const n = num(value);
  if (n === null) return null;
  const precision = 10 ** decimals;
  return Math.round(n * factor * precision) / precision;
}

/** Garmin reports "not measured" body composition values as 0. */
export function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

export function obj(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

export function arr(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => !!item && typeof item === 'object') : [];
}

/** Garmin GMT strings come in two forms: '2026-10-27 16:01:11' and '2026-10-27T16:01:11.0'. */
export function gmtToMs(value: unknown): number | null {
  const s = str(value);
  if (!s) return null;
  const ms = Date.parse(`${s.replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Local wall-clock string normalised to 'YYYY-MM-DDTHH:MM:SS'. */
export function localDateTime(value: unknown): string | null {
  const s = str(value);
  return s ? s.replace(' ', 'T').slice(0, 19) : null;
}

/** FIT stores positions as "semicircles": 2^31 semicircles = 180 degrees. */
export function semicirclesToDegrees(value: unknown): number | null {
  return scaled(value, 180 / 2 ** 31);
}
