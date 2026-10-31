/**
 * Restores a backup made by `npm run backup` (or an automatic one). Stop the app first.
 *
 *   npm run restore -- data/backups/running-companion-2026-10-31-18-30-00.tar.gz
 *   node packages/cli/src/restore.ts - < backup.tar.gz       from standard input (Docker: docker compose run -T)
 *
 * Nothing is deleted: the current database, settings and FIT files move into data/before-restore-<time>/ first.
 * A backup from an older version is fine (the app updates its database on start); one from a newer version is refused.
 */
import { readFileSync } from 'node:fs';
import { buffer } from 'node:stream/consumers';
import { parseArgs } from 'node:util';
import { DATA_DIR, DB_FILE, loadEnv, SETTINGS_FILE, TOKEN_CACHE_FILE } from '@companion/config';
import { readBackup, restoreBackup } from '@companion/jobs';

loadEnv();

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { force: { type: 'boolean', default: false } },
});

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const source = positionals[0] ?? fail('Which backup? npm run restore -- <file>  (or - for standard input)');

// Restoring under a running app would leave it holding the old database open. Check it isn't answering.
async function appIsRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? 8787}/healthz`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

if (!args.force && (await appIsRunning())) fail('The app is running. Stop it first (npm run down, or docker compose stop app), then restore. --force skips this check.');

try {
  const archive = source === '-' ? await buffer(process.stdin) : readFileSync(source);
  const backup = readBackup(archive);
  const { movedTo } = restoreBackup(backup, { dataDir: DATA_DIR, dbFile: DB_FILE, settingsFile: SETTINGS_FILE, tokenCacheFile: TOKEN_CACHE_FILE });
  const { manifest } = backup;
  console.log(`✓ Restored the backup from ${new Date(manifest.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} (version ${manifest.version}${backup.fit.length ? `, ${backup.fit.length} FIT files` : ''}).`);
  if (!backup.settings) console.log('  It had no settings: the app will ask you to set it up again.');
  if (movedTo) console.log(`  What was there before is in ${movedTo}`);
  console.log('  Start the app again.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
