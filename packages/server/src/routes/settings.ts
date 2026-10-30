import { randomBytes, timingSafeEqual } from 'node:crypto';
import { LockedSettingError, type SettingsStore } from '@companion/config';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { setupPage } from '../auth/pages.ts';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '../auth/password.ts';
import type { Sessions } from '../auth/session.ts';
import { isCalendarDate, keyStatus, type KeyCheck } from '../garmin-key.ts';

export interface SettingsRouteOptions {
  settings: SettingsStore;
  sessions: Sessions;
  /** Required on the setup page; see setupPage. */
  setupCode: string;
  checkGarminKey: (key: string) => Promise<KeyCheck>;
  /** Starts a sync in the background (after setup or a new key). */
  syncSoon: () => void;
  /** Demo mode: no setup, and settings can be looked at but not changed. */
  demo?: boolean;
  /** The server's local date, YYYY-MM-DD. */
  today?: () => string;
}

const localToday = () => new Date().toLocaleDateString('en-CA');

export const needsSetup = (settings: SettingsStore) => !settings.read().passwordHash;

/** A fresh setup code: 12 characters, easy to copy from a log. */
export const newSetupCode = () => randomBytes(6).toString('hex');

function sameCode(given: string, expected: string): boolean {
  const a = Buffer.from(given.trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const KEY_MESSAGES: Record<Exclude<KeyCheck, 'ok'>, string> = {
  rejected: 'Garmin didn’t accept this key. Check that you copied all of it, or create a new one.',
  unreachable: 'Couldn’t reach Garmin to check the key. It was saved anyway; the next sync will tell.',
};

/**
 * The first-start setup page, and the Settings screen's API.
 *
 * Until a password exists, the setup page is the only thing the server shows: pages redirect to it and the API answers
 * 401. After that, /setup is gone for good (it redirects to the dashboard) and changes go through Settings, behind the
 * login. Forgot the password? `npm run set-password` on the server sets a new one.
 */
export function settingsRoutes(options: SettingsRouteOptions): Router {
  const { settings, sessions, checkGarminKey, syncSoon } = options;
  const today = options.today ?? localToday;
  const router = Router();
  const form = express.urlencoded({ extended: false, limit: '10kb' });
  const json = express.json({ limit: '10kb' });
  const attempts = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

  // Setup ------------------------------------------------------------------------------------------------------------

  const setupPending = () => !options.demo && needsSetup(settings);

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!setupPending() || req.path === '/setup' || req.path === '/healthz') return next();
    if (req.path.startsWith('/api/') || req.path === '/mcp') return res.status(401).json({ error: 'Not set up yet', setup: true });
    if (req.path === '/login' || req.path.startsWith('/oauth/') || req.accepts(['html', 'json']) === 'html' && !/\.\w+$/.test(req.path)) {
      return res.redirect(`/setup${typeof req.query.code === 'string' ? `?code=${encodeURIComponent(req.query.code)}` : ''}`);
    }
    next(); // The dashboard's files (scripts, icons, manifest): public anyway, and harmless.
  });

  router.get('/setup', (req, res) => {
    if (!setupPending()) return res.redirect('/');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    res.type('html').send(setupPage({ codeRequired: !sameCode(code, options.setupCode), code }));
  });

  router.post('/setup', attempts, form, async (req, res) => {
    if (!setupPending()) return res.redirect(303, '/');
    const body = (req.body ?? {}) as Record<string, string | undefined>;
    const code = String(body.code ?? '');
    const expiresOn = String(body.expires ?? '').trim();
    const key = String(body.key ?? '').trim();
    const again = (error: string) =>
      res.status(400).type('html').send(setupPage({ codeRequired: !sameCode(code, options.setupCode), code, expiresOn, error }));

    if (!sameCode(code, options.setupCode)) return again('That setup code isn’t right. Copy it from the server’s log.');
    const password = String(body.password ?? '');
    if (password.length < MIN_PASSWORD_LENGTH) return again(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== body.repeat) return again('The two passwords differ.');
    if (expiresOn && !isCalendarDate(expiresOn)) return again('The expiry date isn’t a valid date.');

    let keyNote: KeyCheck | null = null;
    if (key) {
      keyNote = await checkGarminKey(key);
      if (keyNote === 'rejected') return again(KEY_MESSAGES.rejected);
    }

    try {
      settings.update({
        passwordHash: await hashPassword(password),
        ...(key ? { garminKey: key, garminKeyAddedAt: new Date().toISOString(), garminKeyExpiresOn: expiresOn || null, garminKeyRejectedAt: null } : {}),
      });
    } catch (error) {
      return again(error instanceof LockedSettingError ? error.message : 'Couldn’t save the settings file. Check that the data folder is writable.');
    }
    sessions.start(res);
    if (key) syncSoon();
    res.redirect(303, '/');
  });

  // Settings (behind the login) -------------------------------------------------------------------------------------

  const api = Router();
  api.use(sessions.requireApi);
  api.put(/.*/, (_req, res, next) => (options.demo ? res.status(403).json({ error: 'This is a demo with generated data: settings can’t be changed.' }) : next()));

  const describe = () => {
    const current = settings.read();
    const locked = settings.locked();
    return {
      demo: options.demo ?? false,
      garmin: keyStatus(current, today(), { fromEnv: locked.has('garminKey') }),
      locked: { password: locked.has('passwordHash'), garminKey: locked.has('garminKey') },
    };
  };

  const save = (res: Response, change: () => void | Promise<void>) =>
    Promise.resolve()
      .then(change)
      .then(() => res.json(describe()))
      .catch((error: unknown) => {
        if (error instanceof LockedSettingError) return res.status(409).json({ error: error.message });
        if (error instanceof InputError) return res.status(422).json({ error: error.message });
        throw error;
      });

  api.get('/', (_req, res) => res.json(describe()));

  const keyBody = z.object({ key: z.string().trim().min(1).max(4096), expiresOn: z.string().nullish() });
  api.put('/garmin-key', json, attempts, (req, res) =>
    save(res, async () => {
      const parsed = keyBody.safeParse(req.body);
      if (!parsed.success) throw new InputError('Paste the key first.');
      const { key, expiresOn } = parsed.data;
      if (expiresOn && !isCalendarDate(expiresOn)) throw new InputError('The expiry date isn’t a valid date.');
      const check = await checkGarminKey(key);
      if (check === 'rejected') throw new InputError(KEY_MESSAGES.rejected);
      settings.update({ garminKey: key, garminKeyAddedAt: new Date().toISOString(), garminKeyExpiresOn: expiresOn || null, garminKeyRejectedAt: null });
      syncSoon();
    }),
  );

  api.put('/garmin-key/expiry', json, (req, res) =>
    save(res, () => {
      const expiresOn = (req.body as { expiresOn?: unknown } | undefined)?.expiresOn;
      if (expiresOn !== null && (typeof expiresOn !== 'string' || !isCalendarDate(expiresOn))) throw new InputError('The expiry date isn’t a valid date.');
      settings.update({ garminKeyExpiresOn: expiresOn });
    }),
  );

  api.put('/password', json, attempts, (req, res) =>
    save(res, async () => {
      const { current = '', next = '' } = (req.body ?? {}) as { current?: string; next?: string };
      if (!(await verifyPassword(String(current), settings.read().passwordHash))) throw new InputError('Your current password isn’t right.');
      if (String(next).length < MIN_PASSWORD_LENGTH) throw new InputError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      // A new session secret logs out every other browser, which is the point of changing a password; this one
      // gets a fresh session below. Claude's connector keeps working: it has its own tokens.
      settings.update({ passwordHash: await hashPassword(String(next)), ...(settings.locked().has('sessionSecret') ? {} : { sessionSecret: randomBytes(32).toString('base64url') }) });
      sessions.start(res);
    }),
  );

  router.use('/api/settings', api);
  return router;
}

class InputError extends Error {}
