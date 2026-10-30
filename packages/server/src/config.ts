import { ensureSessionSecret, type SettingsStore } from '@companion/config';

/**
 * How the server runs: environment variables (.env locally, the service environment on a server), validated once at
 * startup. What a person sets up (password, Garmin key, units) lives in the settings store instead, and the session
 * secret is created there on first start, so a fresh install starts without any configuration.
 */
export interface ServerConfig {
  /** The address people and Claude use to reach the server, e.g. https://companion.example.ts.net. */
  publicUrl: URL;
  port: number;
  /** Interface to listen on. 127.0.0.1: only reachable through the tunnel or reverse proxy in front of it. */
  host: string;
  /** Set when a proxy (Tailscale, Caddy) sits in front: makes client IPs and HTTPS detection correct. */
  trustProxy: boolean;
  /** Local hours at which the scheduled sync runs. */
  syncHours: number[];
  /**
   * Demo mode (DEMO_MODE=true, set by `npm run demo`): generated data, no login, no Garmin, settings read-only.
   * Anyone who can reach the server sees everything, so use it only for data that isn't anyone's.
   */
  demo: boolean;
  /** Optional CARTO basemaps key (free for personal use): nicer light and dark maps. Without it, OpenStreetMap tiles. */
  cartoKey: string | null;
}

export const DEFAULT_SYNC_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters, or leave it unset and the app creates one.');

  const port = Number(env.PORT ?? 8787);
  const publicUrl = new URL(env.PUBLIC_URL ?? `http://localhost:${port}`);
  const syncHours = env.SYNC_HOURS ? env.SYNC_HOURS.split(',').map((hour) => Number(hour.trim())) : DEFAULT_SYNC_HOURS;
  if (syncHours.some((hour) => !Number.isInteger(hour) || hour < 0 || hour > 23)) throw new Error(`SYNC_HOURS must be hours 0–23, got "${env.SYNC_HOURS}"`);

  return {
    publicUrl,
    port,
    host: env.HOST ?? '127.0.0.1',
    trustProxy: env.TRUST_PROXY === 'true',
    syncHours,
    cartoKey: env.CARTO_API_KEY?.trim() || null,
    demo: env.DEMO_MODE === 'true',
  };
}

/** Creates the session secret on first start (kept in the settings file); an environment variable wins. */
export function prepareSettings(store: SettingsStore): void {
  ensureSessionSecret(store);
}
