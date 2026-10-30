import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * What the app asks for in its setup page and Settings screen, stored in data/settings.json.
 *
 * Why a file in the data folder and not .env: the app writes it itself (setup, a new Garmin key, a new password), so
 * nobody has to edit a config file, and the data folder is the one thing a Docker container keeps. Environment
 * variables still win, so a server can be configured entirely from outside; a value set that way is "locked" and the
 * app shows it as such instead of offering to change it.
 *
 * The file holds secrets (the Garmin key, the session secret), so it's written readable by its owner only.
 */
export interface Settings {
  /** scrypt hash of the login password. Never the password itself. */
  passwordHash?: string;
  /** Signs login cookies. Generated on first start; changing it logs out every browser. */
  sessionSecret?: string;
  /** Garmin Personal API key. Never sent back to the browser. */
  garminKey?: string;
  /** When the current key was saved (ISO timestamp). */
  garminKeyAddedAt?: string;
  /** The key's expiry date as Garmin showed it when it was created (YYYY-MM-DD). Garmin's API doesn't report it. */
  garminKeyExpiresOn?: string;
  /** Set by a sync when Garmin refuses the key (wrong, expired or deleted); cleared by a working sync or a new key. */
  garminKeyRejectedAt?: string;
  units?: Units;
}

export type Units = 'metric' | 'imperial';

/** Settings an environment variable can set, and which variable. */
export const ENV_SETTINGS = {
  passwordHash: 'PASSWORD_HASH',
  sessionSecret: 'SESSION_SECRET',
  garminKey: 'GARMIN_PERSONAL_API_KEY',
  units: 'UNITS',
} as const satisfies Partial<Record<keyof Settings, string>>;

type EnvSetting = keyof typeof ENV_SETTINGS;

/** A change: a value sets the field, null removes it. */
export type SettingsPatch = { [K in keyof Settings]?: Settings[K] | null };

export interface SettingsStore {
  /** The settings in effect: the file, with environment variables on top. */
  read(): Settings;
  /** Changes the file. Fields locked by the environment can't be changed and throw. */
  update(patch: SettingsPatch): Settings;
  /** Fields set by an environment variable. */
  locked(): Set<EnvSetting>;
}

function fromEnv(env: NodeJS.ProcessEnv): Settings {
  const settings: Settings = {};
  for (const [field, name] of Object.entries(ENV_SETTINGS) as Array<[EnvSetting, string]>) {
    const value = env[name]?.trim();
    if (!value) continue;
    if (field === 'units') {
      if (value === 'metric' || value === 'imperial') settings.units = value;
    } else settings[field] = value;
  }
  return settings;
}

function applyPatch(current: Settings, patch: SettingsPatch): Settings {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as Settings;
}

function checkLocked(locked: Set<EnvSetting>, patch: SettingsPatch): void {
  const blocked = Object.keys(patch).filter((key) => locked.has(key as EnvSetting));
  if (blocked.length) throw new LockedSettingError(blocked.map((key) => ENV_SETTINGS[key as EnvSetting]));
}

export class LockedSettingError extends Error {
  override name = 'LockedSettingError';
  readonly variables: string[];
  constructor(variables: string[]) {
    super(`Set by the environment (${variables.join(', ')}): change it there.`);
    this.variables = variables;
  }
}

/** The settings file, read fresh on every call: other processes (a sync, the CLI) may have changed it. */
export function fileSettings(file: string, env: NodeJS.ProcessEnv = process.env): SettingsStore {
  const readFile = (): Settings => {
    if (!existsSync(file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Settings) : {};
    } catch {
      throw new Error(`${file} isn't valid JSON. Fix it or delete it (you'll be asked to set up again).`);
    }
  };
  const locked = () => new Set(Object.keys(fromEnv(env)) as EnvSetting[]);
  return {
    read: () => ({ ...readFile(), ...fromEnv(env) }),
    update(patch) {
      checkLocked(locked(), patch);
      const next = applyPatch(readFile(), patch);
      mkdirSync(dirname(file), { recursive: true });
      // Write a temporary file and rename it over the old one: a crash halfway never leaves a half-written file.
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      renameSync(temp, file);
      try {
        chmodSync(file, 0o600);
      } catch {
        // Windows has no Unix permissions; the file is in the user's own folder there.
      }
      return { ...next, ...fromEnv(env) };
    },
    locked,
  };
}

/** For tests: settings kept in memory. */
export function memorySettings(initial: Settings = {}, env: NodeJS.ProcessEnv = {}): SettingsStore {
  let stored = { ...initial };
  const locked = () => new Set(Object.keys(fromEnv(env)) as EnvSetting[]);
  return {
    read: () => ({ ...stored, ...fromEnv(env) }),
    update(patch) {
      checkLocked(locked(), patch);
      stored = applyPatch(stored, patch);
      return { ...stored, ...fromEnv(env) };
    },
    locked,
  };
}

/** The session secret, created and saved the first time it's needed. */
export function ensureSessionSecret(store: SettingsStore): string {
  const existing = store.read().sessionSecret;
  if (existing) return existing;
  const secret = randomBytes(32).toString('base64url');
  store.update({ sessionSecret: secret });
  return secret;
}

/**
 * Earlier versions kept the password hash, session secret and Garmin key in .env. Moves them into the settings file
 * (unless it already has them) and takes their lines out of .env, so the app can manage them from now on. Values
 * aren't printed or changed, only moved: logins stay valid and the same key keeps working. Returns the moved names.
 */
export function moveSecretsFromEnvFile(envFile: string, settingsFile: string): string[] {
  if (!existsSync(envFile)) return [];
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/);
  // The file alone, without environment variables: this runs before .env is loaded.
  const store = fileSettings(settingsFile, {});
  const current = store.read();
  const moved: string[] = [];
  const patch: SettingsPatch = {};
  const kept = lines.filter((line) => {
    const match = /^\s*(PASSWORD_HASH|SESSION_SECRET|GARMIN_PERSONAL_API_KEY)\s*=(.*)$/.exec(line);
    if (!match) return true;
    const name = match[1]!;
    const value = match[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
    if (value) {
      const field = (Object.keys(ENV_SETTINGS) as EnvSetting[]).find((key) => ENV_SETTINGS[key] === name)!;
      if (!current[field]) (patch as Record<string, string>)[field] = value;
      moved.push(name);
    }
    return false; // Empty placeholder lines (from .env.example) are dropped too.
  });
  if (kept.length === lines.length) return [];
  if (patch.garminKey) patch.garminKeyAddedAt = new Date().toISOString();
  if (Object.keys(patch).length) store.update(patch);
  writeFileSync(envFile, kept.join('\n'));
  return moved;
}

export const SETTINGS_FILE_NAME = 'settings.json';
export const settingsFileIn = (dataDir: string) => join(dataDir, SETTINGS_FILE_NAME);
