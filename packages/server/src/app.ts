import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getFreshness } from '@companion/queries';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { CompanionOAuthProvider, SCOPE } from './auth/oauth-provider.ts';
import { messagePage } from './auth/pages.ts';
import { Sessions } from './auth/session.ts';
import type { ServerConfig } from './config.ts';
import { apiRoutes } from './routes/api.ts';
import { authRoutes } from './routes/auth.ts';
import { mcpRoutes } from './routes/mcp.ts';

export interface AppDependencies {
  config: ServerConfig;
  /** Read-only connection for everything that only reads (API, MCP tools). */
  readDb: DatabaseSync;
  /** Write connection for OAuth state. Garmin syncs open their own. */
  writeDb: DatabaseSync;
  sync: () => Promise<unknown>;
  isSyncRunning: () => boolean;
  /** Built dashboard (packages/web/dist). Served when it exists. */
  webRoot?: string;
}

export interface App {
  app: Express;
  oauth: CompanionOAuthProvider;
}

/**
 * Assembles the server from its dependencies. Nothing here opens files or reads the environment,
 * so tests can build the whole app around a temporary database and a fake sync.
 *
 * Route map:
 *   /healthz                          public: is it up, when did it last sync
 *   /login, /logout                   dashboard login
 *   /.well-known/*, /authorize, /token, /register, /revoke   OAuth for Claude (implemented by the MCP SDK)
 *   /oauth/consent                    our login + "Allow" page in the OAuth flow
 *   /mcp                              MCP tools, OAuth access token required
 *   /api/*                            dashboard JSON, session cookie required
 *   /*                                the dashboard's files (public: they hold no data)
 */
export function createApp(deps: AppDependencies): App {
  const { config } = deps;
  const app = express();
  const sessions = new Sessions(config.sessionSecret, config.publicUrl.protocol === 'https:');
  const oauth = new CompanionOAuthProvider(deps.writeDb);
  const mcpUrl = new URL('/mcp', config.publicUrl);

  app.disable('x-powered-by');
  // Behind Tailscale/Caddy the real client IP is in X-Forwarded-For; trusting it keeps rate limits per client.
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders);

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, lastSync: getFreshness(deps.readDb).last_sync, syncRunning: deps.isSyncRunning() });
  });

  app.use(authRoutes({ sessions, passwordHash: config.passwordHash, oauth }));

  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: config.publicUrl,
      resourceServerUrl: mcpUrl,
      scopesSupported: [SCOPE],
      resourceName: 'Running Companion',
    }),
  );

  app.use(
    mcpRoutes({
      db: deps.readDb,
      writeDb: deps.writeDb,
      sync: deps.sync,
      requireToken: requireBearerAuth({ verifier: oauth, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) }),
    }),
  );

  app.use('/api', sessions.requireApi, apiRoutes({ db: deps.readDb, writeDb: deps.writeDb, sync: deps.sync, isSyncRunning: deps.isSyncRunning, cartoKey: config.cartoKey }));

  // The dashboard. Its files are public on purpose: they contain no data (that comes from /api, behind the login),
  // and the browser fetches the PWA manifest, icons and service worker without cookies, so a login wall here
  // would break installing the app. The app itself sends you to /login when /api answers 401.
  const webRoot = deps.webRoot;
  if (webRoot && existsSync(join(webRoot, 'index.html'))) {
    app.use(express.static(webRoot, { index: false, setHeaders: cacheHeaders }));
    // Client-side routing: any other page path gets the app shell, which picks the screen.
    app.get(/.*/, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(join(webRoot, 'index.html')));
  } else {
    app.get('/', sessions.requirePage, (_req, res) => {
      res.type('html').send(messagePage('Logged in', 'The server works. Build the dashboard with: npm run build'));
    });
  }

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  });

  return { app, oauth };
}

/**
 * Built files with a content hash in their name (assets/index-3f9a1c.js) never change: cache them for a year.
 * Everything else (index.html, the service worker, the manifest) must be revalidated, or updates wouldn't arrive.
 */
function cacheHeaders(res: Response, path: string): void {
  res.set('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
}

/**
 * Browser hardening headers:
 * - nosniff: browsers must not guess content types (stops a JSON response being run as a script);
 * - frame-ancestors 'none' / X-Frame-Options: nobody can embed our pages invisibly to trick clicks on "Allow";
 * - no-referrer: our URLs (which may contain an OAuth request id) aren't leaked to other sites.
 */
function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.basemaps.cartocdn.com https://tile.openstreetmap.org; font-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  next();
}
