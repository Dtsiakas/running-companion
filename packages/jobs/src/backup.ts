import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, gunzipSync } from 'node:zlib';
import { latestSchemaVersion, schemaVersion } from '@companion/db';
import { readTar, tarChunks, type TarEntry } from './tar.ts';

/**
 * Backups: one .tar.gz with everything the app keeps, readable with any `tar`.
 *
 *   manifest.json   what made it and when, and the schema version (so an older app refuses a newer backup)
 *   companion.db    a consistent snapshot of the database (VACUUM INTO: safe while the server is writing)
 *   settings.json   password hash, session secret, Garmin key: a backup is as secret as the data folder itself
 *   fit/*.fit       the original activity files (optional: they are large, and everything in them is in the database)
 *
 * Not included: the Garmin token cache (made again from the key) and backups themselves.
 */

export const BACKUP_FORMAT = 1;
const APP = 'running-companion';
const FIT_NAME = /^fit\/[\w.-]+\.fit$/;

export interface DataPaths {
  dataDir: string;
  dbFile: string;
  settingsFile: string;
}

export interface Manifest {
  format: number;
  app: string;
  version: string;
  createdAt: string;
  schema: number;
  fitFiles: number;
}

export interface BackupSummary {
  file: string;
  bytes: number;
  manifest: Manifest;
}

/** A consistent copy of the database, taken while other connections may be writing. */
function snapshotDatabase(dbFile: string): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'companion-backup-'));
  try {
    const copy = join(dir, 'companion.db');
    const db = new DatabaseSync(dbFile, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      db.prepare('VACUUM INTO ?').run(copy);
    } finally {
      db.close();
    }
    return readFileSync(copy);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Writes a backup to `out` (a stream, e.g. stdout). Returns what went in. */
export async function writeBackup(out: Writable, paths: DataPaths, options: { version: string; includeFit?: boolean }): Promise<Manifest> {
  if (!existsSync(paths.dbFile)) throw new Error(`No database at ${paths.dbFile}: nothing to back up.`);
  const database = snapshotDatabase(paths.dbFile);
  const probe = new DatabaseSync(paths.dbFile, { readOnly: true });
  const schema = schemaVersion(probe);
  probe.close();

  const fitDir = join(paths.dataDir, 'fit');
  const fitNames = options.includeFit !== false && existsSync(fitDir) ? readdirSync(fitDir).filter((name) => FIT_NAME.test(`fit/${name}`)).sort() : [];
  const manifest: Manifest = { format: BACKUP_FORMAT, app: APP, version: options.version, createdAt: new Date().toISOString(), schema, fitFiles: fitNames.length };

  async function* entries(): AsyncGenerator<TarEntry> {
    yield { name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), mode: 0o644 };
    yield { name: 'companion.db', data: database };
    if (existsSync(paths.settingsFile)) yield { name: 'settings.json', data: readFileSync(paths.settingsFile) };
    for (const name of fitNames) {
      const file = join(fitDir, name);
      yield { name: `fit/${name}`, data: readFileSync(file), mtime: statSync(file).mtime, mode: 0o644 };
    }
  }

  await pipeline(Readable.from(tarChunks(entries())), createGzip(), out);
  return manifest;
}

/** Writes a backup file (owner-only: it holds secrets). Written under a temporary name first, so a file is never half there. */
export async function writeBackupFile(file: string, paths: DataPaths, options: { version: string; includeFit?: boolean }): Promise<BackupSummary> {
  mkdirSync(dirname(file), { recursive: true });
  const partial = `${file}.partial`;
  try {
    const manifest = await writeBackup(createWriteStream(partial, { mode: 0o600 }), paths, options);
    renameSync(partial, file);
    chmodSync(file, 0o600);
    return { file, bytes: statSync(file).size, manifest };
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
}

export interface Backup {
  manifest: Manifest;
  database: Uint8Array;
  settings: Uint8Array | null;
  fit: TarEntry[];
}

/** Reads and checks a backup: the right app and format, a schema this version knows, a sound database. */
export function readBackup(archive: Uint8Array): Backup {
  let tar: Uint8Array;
  try {
    tar = gunzipSync(archive);
  } catch {
    throw new Error("This isn't a Running Companion backup (not a .tar.gz file, or it's damaged).");
  }
  const entries = readTar(tar);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const manifestEntry = byName.get('manifest.json');
  if (!manifestEntry) throw new Error("This isn't a Running Companion backup (no manifest.json).");
  const manifest = JSON.parse(Buffer.from(manifestEntry.data).toString('utf8')) as Manifest;
  if (manifest.app !== APP) throw new Error("This isn't a Running Companion backup.");
  if (manifest.format !== BACKUP_FORMAT) throw new Error(`This backup's format (${manifest.format}) isn't one this version reads (${BACKUP_FORMAT}). Update the app first.`);
  if (manifest.schema > latestSchemaVersion()) {
    throw new Error(`This backup was made by a newer version (${manifest.version}) with a newer database. Update the app first, then restore.`);
  }

  for (const entry of entries) {
    if (entry.name !== 'manifest.json' && entry.name !== 'companion.db' && entry.name !== 'settings.json' && !FIT_NAME.test(entry.name)) {
      throw new Error(`Unexpected file in the backup: ${entry.name}. Not restoring it.`);
    }
  }

  const database = byName.get('companion.db')?.data;
  if (!database) throw new Error('The backup has no database.');
  checkDatabase(database);

  const settings = byName.get('settings.json')?.data ?? null;
  if (settings) {
    const parsed = JSON.parse(Buffer.from(settings).toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error("The backup's settings.json is damaged.");
  }

  return { manifest, database, settings, fit: entries.filter((entry) => FIT_NAME.test(entry.name)) };
}

function checkDatabase(data: Uint8Array): void {
  const dir = mkdtempSync(join(tmpdir(), 'companion-restore-'));
  try {
    const file = join(dir, 'check.db');
    writeFileSync(file, data);
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const result = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
      if (result !== 'ok') throw new Error(`The backup's database is damaged (${String(result)}).`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("The backup's")) throw error;
      throw new Error("The backup's database can't be opened: it's damaged.");
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Puts a backup in place. Nothing is deleted: what was there (database, settings, FIT files, Garmin token) moves into
 * `before-restore-<time>/` in the data folder first, so a restore can be undone by hand. Run it with the app stopped.
 */
export function restoreBackup(backup: Backup, paths: DataPaths & { tokenCacheFile?: string }, now = new Date()): { movedTo: string | null } {
  mkdirSync(paths.dataDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const aside = join(paths.dataDir, `before-restore-${stamp}`);
  const current = [
    paths.dbFile,
    `${paths.dbFile}-wal`,
    `${paths.dbFile}-shm`,
    paths.settingsFile,
    join(paths.dataDir, 'fit'),
    ...(paths.tokenCacheFile ? [paths.tokenCacheFile] : []),
  ].filter((file) => existsSync(file));

  if (current.length) {
    mkdirSync(aside, { recursive: true });
    for (const file of current) renameSync(file, join(aside, basename(file)));
  }

  const place = (file: string, data: Uint8Array, mode: number) => {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.restoring`;
    writeFileSync(temp, data, { mode });
    renameSync(temp, file);
  };
  place(paths.dbFile, backup.database, 0o600);
  if (backup.settings) place(paths.settingsFile, backup.settings, 0o600);
  for (const entry of backup.fit) place(join(paths.dataDir, entry.name), entry.data, 0o644);

  return { movedTo: current.length ? aside : null };
}

const AUTO_PREFIX = 'running-companion-auto-';

export interface BackupStatus {
  /** When the newest backup in the folder was written (ISO), automatic or by hand. */
  latest: string | null;
  automatic: number;
  byHand: number;
}

/** What's in the backup folder, for Settings. Only names this app writes count; anything else there is left alone. */
export function backupStatus(dir: string): BackupStatus {
  if (!existsSync(dir)) return { latest: null, automatic: 0, byHand: 0 };
  const names = readdirSync(dir).filter((name) => name.startsWith('running-companion-') && name.endsWith('.tar.gz'));
  const latest = names.map((name) => statSync(join(dir, name)).mtimeMs).reduce((a, b) => Math.max(a, b), 0);
  const automatic = names.filter((name) => name.startsWith(AUTO_PREFIX)).length;
  return { latest: latest ? new Date(latest).toISOString() : null, automatic, byHand: names.length - automatic };
}

/** File name for a backup made by hand. */
export const backupFileName = (now = new Date()) => `running-companion-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.tar.gz`;

/**
 * The daily automatic backup: the first call on a day makes one (database and settings, without FIT files, so they
 * stay small), and only the newest `keep` automatic backups are kept. Backups made by hand are never removed.
 * Returns the new backup, or null when today's already exists.
 */
export async function automaticBackup(dir: string, paths: DataPaths, options: { version: string; keep: number; today: string }): Promise<BackupSummary | null> {
  if (options.keep <= 0) return null;
  const file = join(dir, `${AUTO_PREFIX}${options.today}.tar.gz`);
  if (existsSync(file)) return null;
  const summary = await writeBackupFile(file, paths, { version: options.version, includeFit: false });
  const autos = readdirSync(dir)
    .filter((name) => name.startsWith(AUTO_PREFIX) && name.endsWith('.tar.gz'))
    .sort()
    .reverse();
  for (const old of autos.slice(options.keep)) rmSync(join(dir, old), { force: true });
  return summary;
}
