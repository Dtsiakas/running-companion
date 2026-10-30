/**
 * Server settings, all from environment variables (.env locally, the service environment on the server).
 * Validated once at startup: a missing secret should stop the server, not surface as a confusing error later.
 */
export interface ServerConfig {
  /** The address people and Claude use to reach the server, e.g. https://companion.example.ts.net. */
  publicUrl: URL;
  port: number;
  /** Interface to listen on. 127.0.0.1: only reachable through the tunnel or reverse proxy in front of it. */
  host: string;
  /** Signs session cookies. Changing it logs out every browser. */
  sessionSecret: string;
  /** scrypt hash of the login password, created with `npm run set-password`. */
  passwordHash: string;
  /** Set when a proxy (Tailscale, Caddy) sits in front: makes client IPs and HTTPS detection correct. */
  trustProxy: boolean;
  /** Local hours at which the scheduled sync runs. */
  syncHours: number[];
  /** Optional CARTO basemaps key (free for personal use): nicer light and dark maps. Without it, OpenStreetMap tiles. */
  cartoKey: string | null;
}

export const DEFAULT_SYNC_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const missing = ['SESSION_SECRET', 'PASSWORD_HASH'].filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(' and ')} in .env. Run: npm run set-password`);
  }
  if (env.SESSION_SECRET!.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters. Run: npm run set-password');

  const port = Number(env.PORT ?? 8787);
  const publicUrl = new URL(env.PUBLIC_URL ?? `http://localhost:${port}`);
  const syncHours = env.SYNC_HOURS ? env.SYNC_HOURS.split(',').map((hour) => Number(hour.trim())) : DEFAULT_SYNC_HOURS;
  if (syncHours.some((hour) => !Number.isInteger(hour) || hour < 0 || hour > 23)) throw new Error(`SYNC_HOURS must be hours 0–23, got "${env.SYNC_HOURS}"`);

  return {
    publicUrl,
    port,
    host: env.HOST ?? '127.0.0.1',
    sessionSecret: env.SESSION_SECRET!,
    passwordHash: env.PASSWORD_HASH!,
    trustProxy: env.TRUST_PROXY === 'true',
    syncHours,
    cartoKey: env.CARTO_API_KEY?.trim() || null,
  };
}
