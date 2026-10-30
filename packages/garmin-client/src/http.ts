import type { TokenProvider } from './auth.ts';
import { GarminHttpError } from './errors.ts';

export type QueryValue = string | number | boolean | undefined;
export type Query = Record<string, QueryValue>;

export interface HttpClientOptions {
  baseUrl: string;
  tokens: TokenProvider;
  fetch?: typeof fetch;
  /** Retries for HTTP 429 and 5xx. Default 3. */
  maxRetries?: number;
  timeoutMs?: number;
  /** Minimum gap between requests, to stay polite during long backfills. Default 0. */
  minIntervalMs?: number;
}

/** Authenticated, read-only HTTP access to the Personal API. Retries a 401 once with a fresh token. */
export class HttpClient {
  readonly #baseUrl: string;
  readonly #tokens: TokenProvider;
  readonly #fetch: typeof fetch;
  readonly #maxRetries: number;
  readonly #timeoutMs: number;
  readonly #minIntervalMs: number;
  #lastRequestAt = 0;

  constructor(options: HttpClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#tokens = options.tokens;
    this.#fetch = options.fetch ?? fetch;
    this.#maxRetries = options.maxRetries ?? 3;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#minIntervalMs = options.minIntervalMs ?? 0;
  }

  async #throttle(): Promise<void> {
    const wait = this.#lastRequestAt + this.#minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.#lastRequestAt = Date.now();
  }

  /** GET JSON. Returns null for an empty body (Garmin uses 204 / empty for "no data"). */
  async getJson<T = unknown>(path: string, query?: Query): Promise<T | null> {
    const response = await this.#request(path, query, 'application/json');
    const text = await response.text();
    return text.trim() ? (JSON.parse(text) as T) : null;
  }

  async getBytes(path: string, query?: Query): Promise<Uint8Array> {
    const response = await this.#request(path, query, '*/*');
    return new Uint8Array(await response.arrayBuffer());
  }

  async #request(path: string, query: Query | undefined, accept: string): Promise<Response> {
    const url = this.#buildUrl(path, query);
    let refreshedToken = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.#tokens.getToken();
      await this.#throttle();
      const response = await this.#fetch(url, {
        headers: { Authorization: `Bearer ${token.accessToken}`, Accept: accept },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });

      if (response.ok) return response;

      if (response.status === 401 && !refreshedToken) {
        refreshedToken = true;
        await response.body?.cancel();
        await this.#tokens.getToken(true);
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.#maxRetries) {
        await response.body?.cancel();
        await sleep(retryDelayMs(response, attempt));
        continue;
      }

      throw new GarminHttpError(response.status, 'GET', path, await response.text());
    }
  }

  #buildUrl(path: string, query: Query | undefined): string {
    const url = new URL(this.#baseUrl + path);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    return url.toString();
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 120) * 1000;
  return 1000 * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
