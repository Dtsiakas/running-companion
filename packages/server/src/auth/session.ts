import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Login sessions as signed cookies.
 *
 * The cookie holds only an expiry time plus an HMAC signature made with SESSION_SECRET. The server can check it
 * without storing anything, and nobody can forge or extend one without the secret.
 * There is one user, so there is nothing else to store. Logging out clears the cookie;
 * changing SESSION_SECRET invalidates every session at once.
 *
 * Cookie flags: HttpOnly (page scripts can't read it, which limits what an injected script could steal),
 * Secure (HTTPS only, when the server is reached over HTTPS), SameSite=Lax (other sites can't make
 * the browser send it with their POST requests, which blocks cross-site request forgery).
 */
export const SESSION_COOKIE = 'companion_session';
const SESSION_DAYS = 30;

export class Sessions {
  readonly #secret: string;
  readonly #secure: boolean;

  constructor(secret: string, secure: boolean) {
    this.#secret = secret;
    this.#secure = secure;
  }

  /** Sets a new session cookie on the response. */
  start(res: Response): void {
    const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
    const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url');
    res.cookie(SESSION_COOKIE, `${payload}.${this.#sign(payload)}`, {
      httpOnly: true,
      secure: this.#secure,
      sameSite: 'lax',
      path: '/',
      expires: new Date(expiresAt),
    });
  }

  end(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  isValid(req: Request): boolean {
    const cookie = readCookie(req, SESSION_COOKIE);
    if (!cookie) return false;
    const [payload, signature] = cookie.split('.');
    if (!payload || !signature) return false;

    const expected = Buffer.from(this.#sign(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

    try {
      const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
      return typeof exp === 'number' && exp > Date.now();
    } catch {
      return false;
    }
  }

  /** For JSON endpoints: 401 without a session. */
  requireApi = (req: Request, res: Response, next: NextFunction): void => {
    if (this.isValid(req)) next();
    else res.status(401).json({ error: 'Not logged in' });
  };

  /** For pages: redirect to the login page, then back. */
  requirePage = (req: Request, res: Response, next: NextFunction): void => {
    if (this.isValid(req)) next();
    else res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  };

  #sign(payload: string): string {
    return createHmac('sha256', this.#secret).update(payload).digest('base64url');
  }
}

/** Minimal cookie parsing: we read exactly one cookie, so a parser dependency isn't worth it. */
function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
