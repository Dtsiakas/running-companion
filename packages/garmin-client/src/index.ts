import { GarminApi } from './api.ts';
import { TokenProvider } from './auth.ts';
import { resolveApiKey, resolveBaseUrl } from './config.ts';
import { HttpClient } from './http.ts';

export { GarminApi } from './api.ts';
export { TokenProvider, type BearerToken } from './auth.ts';
export { DEFAULT_BASE_URL, DEFAULT_KEY_FILE, resolveApiKey, resolveBaseUrl } from './config.ts';
export { daysAgo, toCalendarDate, type CalendarDate, type DateInput } from './dates.ts';
export { GarminError, GarminHttpError, InvalidApiKeyError, MissingApiKeyError } from './errors.ts';
export { HttpClient, type Query } from './http.ts';

export interface CreateGarminApiOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Bearer token cache location. Omit to keep the token in memory only. */
  tokenCacheFile?: string;
  fetch?: typeof fetch;
  /** Minimum gap between API requests in milliseconds. */
  minIntervalMs?: number;
}

/** Wires key resolution, token exchange and the HTTP client together. */
export function createGarminApi(options: CreateGarminApiOptions = {}) {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const tokens = new TokenProvider({
    apiKey: options.apiKey ?? resolveApiKey(),
    baseUrl,
    cacheFile: options.tokenCacheFile,
    fetch: options.fetch,
  });
  const http = new HttpClient({ baseUrl, tokens, fetch: options.fetch, minIntervalMs: options.minIntervalMs });
  return { api: new GarminApi(http), tokens };
}
