import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { CompanionOAuthProvider } from '../auth/oauth-provider.ts';
import { consentPage, loginPage, messagePage } from '../auth/pages.ts';
import { verifyPassword } from '../auth/password.ts';
import type { Sessions } from '../auth/session.ts';
import { requestI18n } from '../locale.ts';

export interface AuthRouteOptions {
  sessions: Sessions;
  /** Read on each attempt: the password can change while the server runs. */
  passwordHash: () => string | undefined;
  oauth: CompanionOAuthProvider;
}

/**
 * Only same-site relative paths, so a crafted link can't use the login page to redirect somewhere else. Browsers drop
 * tabs and newlines in URLs and read a backslash as a slash, so "/\t/evil.com" or "/\\evil.com" would become
 * "//evil.com", another site: anything with those characters, or a second slash at the start, goes to the home page.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.length > 2000) return '/';
  if (/[\u0000-\u001f\u007f\\]/.test(next) || next.startsWith('//')) return '/';
  return next;
}

/** Login, logout, and the OAuth consent page that Claude's connector sends you to. */
export function authRoutes({ sessions, passwordHash, oauth }: AuthRouteOptions): Router {
  const router = Router();
  const form = express.urlencoded({ extended: false, limit: '10kb' });

  // Brute-force protection: 10 password attempts per 15 minutes per IP address.
  const passwordAttempts = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      const t = requestI18n(req).m.pages;
      res.status(429).type('html').send(messagePage(t.tooMany, t.waitRetry, t));
    },
  });

  router.get('/login', (req, res) => {
    const next = safeNext(req.query.next);
    if (sessions.isValid(req)) return res.redirect(next);
    res.type('html').send(loginPage({ next }, requestI18n(req).m.pages));
  });

  router.post('/login', passwordAttempts, form, async (req, res) => {
    const next = safeNext(req.body?.next);
    if (!(await verifyPassword(String(req.body?.password ?? ''), passwordHash()))) {
      const t = requestI18n(req).m.pages;
      return res.status(401).type('html').send(loginPage({ next, error: t.wrongPassword }, t));
    }
    sessions.start(res);
    res.redirect(303, next);
  });

  router.post('/logout', (_req, res) => {
    sessions.end(res);
    res.redirect(303, '/login');
  });

  router.get('/oauth/consent', (req, res) => {
    const requestId = String(req.query.request ?? '');
    const pending = oauth.getPending(requestId);
    const t = requestI18n(req).m.pages;
    if (!pending) return res.status(400).type('html').send(messagePage(t.expired, t.startAgain, t));
    res.type('html').send(
      consentPage({
        requestId,
        clientName: pending.client.client_name ?? t.anApp,
        redirectHost: new URL(pending.params.redirectUri).host,
        needsPassword: !sessions.isValid(req),
      }, t),
    );
  });

  router.post('/oauth/consent', passwordAttempts, form, async (req, res) => {
    const requestId = String(req.body?.request ?? '');
    const pending = oauth.getPending(requestId);
    const t = requestI18n(req).m.pages;
    if (!pending) return res.status(400).type('html').send(messagePage(t.expired, t.startAgain, t));

    if (req.body?.action === 'deny') return res.redirect(303, oauth.deny(requestId).href);

    // Approving requires being logged in, or the password right here.
    if (!sessions.isValid(req)) {
      if (!(await verifyPassword(String(req.body?.password ?? ''), passwordHash()))) {
        return res.status(401).type('html').send(
          consentPage({
            requestId,
            clientName: pending.client.client_name ?? t.anApp,
            redirectHost: new URL(pending.params.redirectUri).host,
            needsPassword: true,
            error: t.wrongPassword,
          }, t),
        );
      }
      sessions.start(res);
    }
    res.redirect(303, oauth.approve(requestId).href);
  });

  return router;
}
