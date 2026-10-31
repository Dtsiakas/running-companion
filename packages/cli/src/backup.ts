/**
 * Backs up everything the app keeps (database, settings, original FIT files) into one .tar.gz.
 *
 *   npm run backup                          into data/backups/ (or BACKUP_DIR)
 *   npm run backup -- --out ~/companion.tar.gz
 *   npm run backup -- --without-fit         database and settings only: much smaller
 *   node packages/cli/src/backup.ts --out - > backup.tar.gz      to standard output (from Docker: docker exec)
 *
 * Safe while the app runs. The file holds your password hash and Garmin key: keep it as private as the data folder.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { APP_VERSION, BACKUP_DIR, DATA_DIR, DB_FILE, loadEnv, SETTINGS_FILE } from '@companion/config';
import { backupFileName, writeBackup, writeBackupFile } from '@companion/jobs';

loadEnv();

const { values: args } = parseArgs({
  options: {
    out: { type: 'string' },
    'without-fit': { type: 'boolean', default: false },
  },
});

const paths = { dataDir: DATA_DIR, dbFile: DB_FILE, settingsFile: SETTINGS_FILE };
const options = { version: APP_VERSION, includeFit: !args['without-fit'] };

try {
  if (args.out === '-') {
    if (process.stdout.isTTY) throw new Error('Standard output is a terminal: redirect it to a file, e.g. --out - > backup.tar.gz');
    const manifest = await writeBackup(process.stdout, paths, options);
    console.error(`✓ Backup written (${manifest.fitFiles} FIT files)`);
  } else {
    const file = resolve(args.out ?? resolve(BACKUP_DIR, backupFileName()));
    const { bytes, manifest } = await writeBackupFile(file, paths, options);
    console.log(`✓ ${file}`);
    console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB, database and settings${manifest.fitFiles ? ` and ${manifest.fitFiles} FIT files` : ''}`);
    console.log('  It contains your password hash and Garmin key: keep it somewhere private, and off this machine too.');
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
