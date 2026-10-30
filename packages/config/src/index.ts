import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileSettings, moveSecretsFromEnvFile, settingsFileIn, type SettingsStore } from './settings.ts';

export * from './settings.ts';

/**
 * Project paths, derived from this file's location rather than the working directory.
 * That matters for the MCP server: Claude Desktop starts it from its own folder, not from the project.
 * DATA_DIR can be moved with COMPANION_DATA_DIR (a Docker volume, say).
 */
export const ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const DATA_DIR = process.env.COMPANION_DATA_DIR ? resolve(process.env.COMPANION_DATA_DIR) : join(ROOT, 'data');
export const DB_FILE = join(DATA_DIR, 'companion.db');
export const SETTINGS_FILE = settingsFileIn(DATA_DIR);
export const TOKEN_CACHE_FILE = process.env.COMPANION_DATA_DIR ? join(DATA_DIR, '.cache', 'garmin-token.json') : join(ROOT, '.cache', 'garmin-token.json');

/**
 * Loads `.env` from the project root if present. Values already set in the environment win.
 * First moves secrets an older version kept there into the settings file (see moveSecretsFromEnvFile).
 */
export function loadEnv(): void {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  moveSecretsFromEnvFile(file, SETTINGS_FILE);
  process.loadEnvFile(file);
}

/** The app's settings: data/settings.json with environment variables on top. */
export function settings(): SettingsStore {
  return fileSettings(SETTINGS_FILE);
}

/** The Garmin key in effect (environment, then settings), or undefined to fall back to Garmin's key file. */
export function garminKey(): string | undefined {
  return settings().read().garminKey;
}
