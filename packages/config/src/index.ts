import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Project paths, derived from this file's location rather than the working directory.
 * That matters for the MCP server: Claude Desktop starts it from its own folder, not from the project.
 */
export const ROOT = resolve(import.meta.dirname, '..', '..', '..');
export const DATA_DIR = join(ROOT, 'data');
export const DB_FILE = join(DATA_DIR, 'companion.db');
export const TOKEN_CACHE_FILE = join(ROOT, '.cache', 'garmin-token.json');

/** Loads `.env` from the project root if present. Values already set in the environment win. */
export function loadEnv(): void {
  const file = join(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
