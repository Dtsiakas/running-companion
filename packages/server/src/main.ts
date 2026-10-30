/**
 * Starts the web server: dashboard, API, remote MCP endpoint and the scheduled Garmin sync.
 *
 *   npm start
 */
import { join } from 'node:path';
import { DB_FILE, loadEnv, ROOT } from '@companion/config';
import { openDatabase } from '@companion/db';
import { isSyncRunning, openReadOnly, prepareDatabase, syncNow } from '@companion/jobs';
import { createApp } from './app.ts';
import { loadServerConfig } from './config.ts';
import { startScheduler } from './scheduler.ts';

loadEnv();
const config = loadServerConfig();
const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);

prepareDatabase(DB_FILE);
const readDb = openReadOnly(DB_FILE);
const writeDb = openDatabase(DB_FILE);
const sync = () => syncNow(DB_FILE);

const { app, oauth } = createApp({ config, readDb, writeDb, sync, isSyncRunning, webRoot: join(ROOT, 'packages', 'web', 'dist') });

const scheduler = startScheduler({
  hours: config.syncHours,
  run: async () => {
    await sync();
    oauth.pruneExpired();
  },
  log,
});

const server = app.listen(config.port, config.host, () => {
  log(`Running Companion listening on http://${config.host}:${config.port} (public URL ${config.publicUrl.href})`);
  log(`Next scheduled sync: ${scheduler.next().toLocaleString()}`);
  // `npm run up` sets this: when the app only runs now and then, the scheduled hours may all have passed while it was off.
  if (process.env.SYNC_ON_START === 'true') {
    log('Syncing with Garmin (on start)');
    sync()
      .then((result) => log(`Sync finished in ${result.seconds}s`))
      .catch((error: unknown) => log(`Sync failed: ${error instanceof Error ? error.message : String(error)}`));
  }
});

// Clean shutdown (Ctrl+C, systemd stop, a deploy restarting the service): finish open requests, close the database.
const shutdown = (signal: string) => {
  log(`${signal} received, shutting down`);
  scheduler.stop();
  server.close(() => {
    readDb.close();
    writeDb.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
