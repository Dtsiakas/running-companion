import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MissingApiKeyError } from './errors.ts';

export const DEFAULT_BASE_URL = 'https://personal.connectapi.garmin.com';

/** Same location Garmin's own `gc-personal` CLI uses, so a key saved by either tool works for both. */
export const DEFAULT_KEY_FILE = join(homedir(), '.config', 'garmin', 'connect-personal-api-key');

export function resolveBaseUrl(): string {
  return (process.env.GARMIN_PERSONAL_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Key lookup order: GARMIN_PERSONAL_API_KEY env var, then the key file. */
export function resolveApiKey(keyFile: string = DEFAULT_KEY_FILE): string {
  const fromEnv = process.env.GARMIN_PERSONAL_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  if (existsSync(keyFile)) {
    const fromFile = readFileSync(keyFile, 'utf8').trim();
    if (fromFile) return fromFile;
  }

  throw new MissingApiKeyError(keyFile);
}
