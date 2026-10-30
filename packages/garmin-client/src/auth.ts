import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GarminHttpError, InvalidApiKeyError } from './errors.ts';

const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';

/** Re-exchange the key when less than this much lifetime remains (Garmin's client uses one hour). */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

/** Fallback when the token is not a JWT with an `exp` claim. Garmin documents a 24h token. */
const ASSUMED_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface BearerToken {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

interface CachedToken extends BearerToken {
  /** SHA-256 of the API key, so a cached token is never reused after the key changes. */
  keyHash: string;
}

export interface TokenProviderOptions {
  apiKey: string;
  baseUrl: string;
  /** Where to cache the bearer token between runs. Omit to keep it in memory only. */
  cacheFile?: string;
  fetch?: typeof fetch;
}

/**
 * Exchanges the long-lived Personal API key for a short-lived bearer token and caches it.
 * Personal tokens have no refresh token: a new one is minted from the key when needed.
 */
export class TokenProvider {
  readonly #apiKey: string;
  readonly #keyHash: string;
  readonly #baseUrl: string;
  readonly #cacheFile: string | undefined;
  readonly #fetch: typeof fetch;
  #token: BearerToken | undefined;
  #pending: Promise<BearerToken> | undefined;

  constructor(options: TokenProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#keyHash = createHash('sha256').update(options.apiKey).digest('hex');
    this.#baseUrl = options.baseUrl;
    this.#cacheFile = options.cacheFile;
    this.#fetch = options.fetch ?? fetch;
  }

  async getToken(forceRefresh = false): Promise<BearerToken> {
    if (!forceRefresh) {
      this.#token ??= this.#readCache();
      if (this.#token && isFresh(this.#token)) return this.#token;
    }

    // Concurrent callers share one exchange instead of each minting a token.
    this.#pending ??= this.#exchange().finally(() => {
      this.#pending = undefined;
    });
    this.#token = await this.#pending;
    return this.#token;
  }

  async #exchange(): Promise<BearerToken> {
    const response = await this.#fetch(this.#baseUrl + TOKEN_PATH, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${this.#apiKey}`, Accept: 'application/json, text/plain' },
    });
    const text = await response.text();

    if (!response.ok) {
      const error = new GarminHttpError(response.status, 'POST', TOKEN_PATH, text);
      throw response.status === 401 || response.status === 403 ? new InvalidApiKeyError(error) : error;
    }

    const accessToken = extractAccessToken(text);
    const token: BearerToken = {
      accessToken,
      expiresAt: jwtExpiry(accessToken) ?? Date.now() + ASSUMED_LIFETIME_MS,
    };
    this.#writeCache(token);
    return token;
  }

  #readCache(): BearerToken | undefined {
    if (!this.#cacheFile) return undefined;
    try {
      const cached = JSON.parse(readFileSync(this.#cacheFile, 'utf8')) as Partial<CachedToken>;
      if (cached.keyHash !== this.#keyHash || !cached.accessToken || !cached.expiresAt) return undefined;
      return { accessToken: cached.accessToken, expiresAt: cached.expiresAt };
    } catch {
      return undefined;
    }
  }

  #writeCache(token: BearerToken): void {
    if (!this.#cacheFile) return;
    try {
      mkdirSync(dirname(this.#cacheFile), { recursive: true });
      const cached: CachedToken = { ...token, keyHash: this.#keyHash };
      writeFileSync(this.#cacheFile, JSON.stringify(cached), { mode: 0o600 });
    } catch {
      // The cache is an optimisation: failing to write it must not fail the request.
    }
  }
}

function isFresh(token: BearerToken): boolean {
  return token.expiresAt - Date.now() > REFRESH_MARGIN_MS;
}

/**
 * The exact response shape is not documented: reports describe a raw token string.
 * Accept a raw JWT, a JSON string, or a JSON object with a common token field name.
 */
function extractAccessToken(body: string): string {
  const trimmed = body.trim();
  let parsed: unknown = trimmed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON: treat the body as the token itself.
  }

  if (typeof parsed === 'string' && parsed) return parsed;
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    for (const field of ['access_token', 'accessToken', 'token', 'bearerToken']) {
      const value = record[field];
      if (typeof value === 'string' && value) return value;
    }
    throw new Error(`Token response JSON has no recognised token field (fields: ${Object.keys(record).join(', ')})`);
  }
  throw new Error('Token response was empty');
}

/** Reads the `exp` claim (seconds) of a JWT. Returns undefined if the token is not a JWT. */
function jwtExpiry(token: string): number | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
