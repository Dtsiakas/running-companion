/**
 * Starts the web server: dashboard, API, remote MCP endpoint and the scheduled Garmin sync.
 *
 *   npm start
 */
import { join } from 'node:path';
import { APP_VERSION, BACKUP_DIR, DATA_DIR, DB_FILE, loadEnv, ROOT, SETTINGS_FILE, settings as settingsStore } from '@companion/config';
import { openDatabase } from '@companion/db';
import { automaticBackup, isSyncRunning, openReadOnly, prepareDatabase, runQueryIsolated, syncNow } from '@companion/jobs';
import { createApp } from './app.ts';
import { loadServerConfig, prepareSettings } from './config.ts';
import { checkGarminKey } from './garmin-key.ts';
import { startScheduler } from './scheduler.ts';

loadEnv();
const config = loadServerConfig();
const settings = settingsStore();
prepareSettings(settings);
const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);

prepareDatabase(DB_FILE);
const readDb = openReadOnly(DB_FILE);
const writeDb = openDatabase(DB_FILE);
const sync = config.demo ? () => Promise.reject(new Error('This is a demo with generated data: there is nothing to sync.')) : () => syncNow(DB_FILE);

const { app, oauth, needsSetup, setupCode } = createApp({ config, settings, checkGarminKey, readDb, writeDb, sync, isSyncRunning, query: (sql) => runQueryIsolated(DB_FILE, sql), webRoot: join(ROOT, 'packages', 'web', 'dist') });

// The day's first scheduled run (or the start, when the app was off) also makes the daily backup. Kept apart from the
// sync: a failed backup is logged and never stops a sync, and the other way round.
const dailyBackup = async () => {
  if (config.demo || needsSetup()) return;
  try {
    const made = await automaticBackup(BACKUP_DIR, { dataDir: DATA_DIR, dbFile: DB_FILE, settingsFile: SETTINGS_FILE }, { version: APP_VERSION, keep: config.backupKeep, today: new Date().toLocaleDateString('en-CA') });
    if (made) log(`Backup saved: ${made.file} (${(made.bytes / 1024 / 1024).toFixed(1)} MB)`);
  } catch (error) {
    log(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const scheduler = startScheduler({
  hours: config.syncHours,
  run: async () => {
    if (!config.demo && !needsSetup()) await sync();
    oauth.pruneExpired();
    await dailyBackup();
  },
  log,
});

const server = app.listen(config.port, config.host, () => {
  log(`Running Companion listening on http://${config.host}:${config.port} (public URL ${config.publicUrl.href})`);
  log(`Next scheduled sync: ${scheduler.next().toLocaleString()}`);
  if (config.demo) {
    log('Demo mode: generated data, no login. Open the address above.');
    return;
  }
  if (needsSetup()) {
    log(`Not set up yet. Open this address to choose a password and add your Garmin key:`);
    log(`  ${new URL(`/setup?code=${setupCode}`, config.publicUrl).href}`);
    log(`  (setup code: ${setupCode})`);
    return;
  }
  void dailyBackup();
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
