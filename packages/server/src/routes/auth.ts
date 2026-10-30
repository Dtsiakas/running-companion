import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { CompanionOAuthProvider } from '../auth/oauth-provider.ts';
import { consentPage, loginPage, messagePage } from '../auth/pages.ts';
import { verifyPassword } from '../auth/password.ts';
import type { Sessions } from '../auth/session.ts';

export interface AuthRouteOptions {
  sessions: Sessions;
  /** Read on each attempt: the password can change while the server runs. */
  passwordHash: () => string | undefined;
  oauth: CompanionOAuthProvider;
}

/** Only same-site relative paths, so a crafted link can't use the login page to redirect somewhere else. */
function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
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
    handler: (_req, res) => res.status(429).type('html').send(messagePage('Too many attempts', 'Wait 15 minutes, then try again.')),
  });

  router.get('/login', (req, res) => {
    const next = safeNext(req.query.next);
    if (sessions.isValid(req)) return res.redirect(next);
    res.type('html').send(loginPage({ next }));
  });

  router.post('/login', passwordAttempts, form, async (req, res) => {
    const next = safeNext(req.body?.next);
    if (!(await verifyPassword(String(req.body?.password ?? ''), passwordHash()))) {
      return res.status(401).type('html').send(loginPage({ next, error: 'Wrong password.' }));
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
    if (!pending) return res.status(400).type('html').send(messagePage('Request expired', 'Start the connection again from Claude.'));
    res.type('html').send(
      consentPage({
        requestId,
        clientName: pending.client.client_name ?? 'An application',
        redirectHost: new URL(pending.params.redirectUri).host,
        needsPassword: !sessions.isValid(req),
      }),
    );
  });

  router.post('/oauth/consent', passwordAttempts, form, async (req, res) => {
    const requestId = String(req.body?.request ?? '');
    const pending = oauth.getPending(requestId);
    if (!pending) return res.status(400).type('html').send(messagePage('Request expired', 'Start the connection again from Claude.'));

    if (req.body?.action === 'deny') return res.redirect(303, oauth.deny(requestId).href);

    // Approving requires being logged in, or the password right here.
    if (!sessions.isValid(req)) {
      if (!(await verifyPassword(String(req.body?.password ?? ''), passwordHash()))) {
        return res.status(401).type('html').send(
          consentPage({
            requestId,
            clientName: pending.client.client_name ?? 'An application',
            redirectHost: new URL(pending.params.redirectUri).host,
            needsPassword: true,
            error: 'Wrong password.',
          }),
        );
      }
      sessions.start(res);
    }
    res.redirect(303, oauth.approve(requestId).href);
  });

  return router;
}
