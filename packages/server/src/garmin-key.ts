import { existsSync } from 'node:fs';
import type { Settings } from '@companion/config';
import { DEFAULT_KEY_FILE, InvalidApiKeyError, resolveBaseUrl, TokenProvider } from '@companion/garmin-client';

/** How many days ahead the app starts reminding you to make a new key. */
export const EXPIRY_WARNING_DAYS = 14;

export type KeyCheck = 'ok' | 'rejected' | 'unreachable';

/**
 * Tries a key the way a sync would: exchanges it for a token. Nothing is cached, and the key goes nowhere else.
 * 'unreachable' means Garmin couldn't be asked (offline, Garmin down), which says nothing about the key itself.
 */
export async function checkGarminKey(key: string): Promise<KeyCheck> {
  try {
    // Someone is waiting on the setup page: shorter limits than a sync's, so offline answers within about half a minute.
    await new TokenProvider({ apiKey: key, baseUrl: resolveBaseUrl(), timeoutMs: 8_000, retryBaseMs: 500 }).getToken();
    return 'ok';
  } catch (error) {
    return error instanceof InvalidApiKeyError ? 'rejected' : 'unreachable';
  }
}

export interface KeyStatus {
  /**
   * missing: no key anywhere. rejected: the last sync was refused. expired: past the date you entered.
   * expiring: within EXPIRY_WARNING_DAYS of it. ok: none of these (including when no date was entered).
   */
  state: 'missing' | 'rejected' | 'expired' | 'expiring' | 'ok';
  /** settings: saved in the app. environment: GARMIN_PERSONAL_API_KEY. file: Garmin's own key file. */
  source: 'settings' | 'environment' | 'file' | null;
  addedOn: string | null;
  expiresOn: string | null;
  daysLeft: number | null;
  rejectedAt: string | null;
}

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export function keyStatus(settings: Settings, today: string, options: { fromEnv: boolean; keyFile?: string }): KeyStatus {
  const source: KeyStatus['source'] = settings.garminKey ? (options.fromEnv ? 'environment' : 'settings') : existsSync(options.keyFile ?? DEFAULT_KEY_FILE) ? 'file' : null;
  const expiresOn = settings.garminKeyExpiresOn ?? null;
  const daysLeft = expiresOn ? Math.round(dayNumber(expiresOn) - dayNumber(today)) : null;
  const state: KeyStatus['state'] = !source
    ? 'missing'
    : settings.garminKeyRejectedAt
      ? 'rejected'
      : daysLeft !== null && daysLeft < 0
        ? 'expired'
        : daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS
          ? 'expiring'
          : 'ok';
  return {
    state,
    source,
    addedOn: settings.garminKeyAddedAt?.slice(0, 10) ?? null,
    expiresOn,
    daysLeft,
    rejectedAt: settings.garminKeyRejectedAt ?? null,
  };
}

/** A YYYY-MM-DD date that exists. */
export { isCalendarDate } from '@companion/dates';
