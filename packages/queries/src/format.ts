import { ENGLISH, type Format } from '@companion/i18n';

/** Formatting for tool output: what a runner reads, not what the database stores. */

/** "5:22/km", or "8:38/mi" for a reader in miles. */
export function pace(speedMps: number | null | undefined, f: Format = ENGLISH.f): string | null {
  if (!speedMps || speedMps <= 0) return null;
  return f.pace(speedMps);
}

export function duration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function km(metres: number | null | undefined): number | null {
  return metres === null || metres === undefined ? null : round(metres / 1000, 2);
}

export function round(value: number | null | undefined, digits = 1): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function percent(part: number | null | undefined, total: number | null | undefined): number | null {
  return part === null || part === undefined || !total ? null : Math.round((100 * part) / total);
}
