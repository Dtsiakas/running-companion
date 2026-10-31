import { locale, m } from '../lib/i18n.ts';

/** Thrown for any non-2xx answer except 401 (which redirects to the login page instead). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Sends the browser to the server's login page, returning here afterwards. */
export function goToLogin(): never {
  window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  // The page is navigating away; stop whatever called this.
  throw new ApiError(401, 'Not logged in');
}

/**
 * The single way the app talks to the server. The session cookie travels automatically (same origin),
 * so there's no token handling here. A 401 means the session expired: go log in, then come back.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Every request says which language and units to answer in: the server writes some sentences and paces itself.
  const url = new URL(path, window.location.origin);
  if (url.pathname.startsWith('/api/')) {
    url.searchParams.set('lang', locale.lang);
    url.searchParams.set('units', locale.units);
  }
  const response = await fetch(url.pathname + url.search, { ...init, headers: { Accept: 'application/json', ...init?.headers } });
  if (response.status === 401) goToLogin();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? m.app.states.requestFailed(response.status));
  }
  // 204 No Content (a delete) has no body to parse.
  return (response.status === 204 ? undefined : await response.json()) as T;
}


/** Ends the session and removes cached data from this device: an offline copy of health data shouldn't outlive the login. */
export async function logout(): Promise<void> {
  if ('caches' in window) await caches.delete('api');
  await fetch('/logout', { method: 'POST' });
  window.location.assign('/login');
}
