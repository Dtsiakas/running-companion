import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { latestSchemaVersion, openDatabase } from '@companion/db';
import { automaticBackup, backupStatus, readBackup, restoreBackup, writeBackupFile } from '../src/backup.ts';
import { readTar, tarChunks } from '../src/tar.ts';

async function tarOf(entries: Array<{ name: string; data: Uint8Array }>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of tarChunks(entries)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function dataFolder() {
  const dataDir = mkdtempSync(join(tmpdir(), 'companion-test-'));
  const paths = { dataDir, dbFile: join(dataDir, 'companion.db'), settingsFile: join(dataDir, 'settings.json') };
  const db = openDatabase(paths.dbFile);
  db.exec("CREATE TABLE backup_probe (value TEXT); INSERT INTO backup_probe VALUES ('first')");
  db.close();
  writeFileSync(paths.settingsFile, JSON.stringify({ passwordHash: 'hash', garminKey: 'key' }), { mode: 0o600 });
  mkdirSync(join(dataDir, 'fit'));
  writeFileSync(join(dataDir, 'fit', '123.fit'), Buffer.from([1, 2, 3]));
  return paths;
}

const probe = (dbFile: string) => {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  const rows = db.prepare('SELECT value FROM backup_probe').all().map((row) => row.value);
  db.close();
  return rows;
};

// System tar is called with relative paths: GNU tar on Windows reads "C:\\…" as a remote host.
test('tar: what is written reads back, and system tar agrees', async () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('hello') },
    { name: 'dir/b.bin', data: new Uint8Array(1500).fill(7) },
    { name: 'empty', data: new Uint8Array(0) },
  ];
  const archive = await tarOf(entries);
  assert.equal(archive.length % 512, 0);
  const read = readTar(archive);
  assert.deepEqual(read.map((e) => e.name), ['a.txt', 'dir/b.bin', 'empty']);
  assert.deepEqual(Buffer.from(read[1]!.data), Buffer.from(entries[1]!.data));

  const dir = mkdtempSync(join(tmpdir(), 'companion-tar-'));
  writeFileSync(join(dir, 'x.tar'), archive);
  assert.deepEqual(execFileSync('tar', ['-tf', 'x.tar'], { cwd: dir, encoding: 'utf8' }).trim().split('\n'), ['a.txt', 'dir/b.bin', 'empty']);
});

test('tar: a damaged header is refused', async () => {
  const archive = await tarOf([{ name: 'a.txt', data: Buffer.from('hello') }]);
  archive[0] = 'b'.charCodeAt(0);
  assert.throws(() => readTar(archive), /checksum/);
});

test('backup and restore: a round trip brings back the database, settings and FIT files', async () => {
  const source = dataFolder();
  const file = join(source.dataDir, 'backups', 'b.tar.gz');
  const summary = await writeBackupFile(file, source, { version: '9.9.9' });
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600); // Windows has no Unix modes
  assert.equal(summary.manifest.fitFiles, 1);
  assert.equal(summary.manifest.schema, latestSchemaVersion());
  assert.deepEqual(execFileSync('tar', ['-tzf', 'b.tar.gz'], { cwd: join(source.dataDir, 'backups'), encoding: 'utf8' }).trim().split('\n'), ['manifest.json', 'companion.db', 'settings.json', 'fit/123.fit']);

  // Restore over a different install: what was there moves aside, nothing is deleted.
  const target = dataFolder();
  const db = new DatabaseSync(target.dbFile);
  db.exec("UPDATE backup_probe SET value = 'target'");
  db.close();
  const tokenCacheFile = join(target.dataDir, '.cache', 'garmin-token.json');
  mkdirSync(join(target.dataDir, '.cache'));
  writeFileSync(tokenCacheFile, '{}');

  const backup = readBackup(readFileSync(file));
  assert.equal(backup.manifest.version, '9.9.9');
  const { movedTo } = restoreBackup(backup, { ...target, tokenCacheFile }, new Date('2026-10-31T18:30:00Z'));

  assert.deepEqual(probe(target.dbFile), ['first']);
  assert.deepEqual(JSON.parse(readFileSync(target.settingsFile, 'utf8')), { passwordHash: 'hash', garminKey: 'key' });
  assert.deepEqual([...readFileSync(join(target.dataDir, 'fit', '123.fit'))], [1, 2, 3]);
  if (process.platform !== 'win32') assert.equal(statSync(target.settingsFile).mode & 0o777, 0o600);
  assert.ok(movedTo?.endsWith('before-restore-2026-10-31T18-30-00'));
  assert.deepEqual(probe(join(movedTo!, 'companion.db')), ['target']);
  assert.ok(existsSync(join(movedTo!, 'garmin-token.json')));
  assert.ok(!existsSync(tokenCacheFile));
});

test('backup: --without-fit leaves the FIT files out', async () => {
  const source = dataFolder();
  const { manifest, file } = await writeBackupFile(join(source.dataDir, 'small.tar.gz'), source, { version: '1.0.0', includeFit: false });
  assert.equal(manifest.fitFiles, 0);
  assert.equal(readBackup(readFileSync(file)).fit.length, 0);
});

test('restore refuses what is not a sound backup', async () => {
  const manifest = (schema: number) => Buffer.from(JSON.stringify({ format: 1, app: 'running-companion', version: '1.0.0', createdAt: '', schema, fitFiles: 0 }));
  const source = dataFolder();
  const database = readFileSync(source.dbFile);

  assert.throws(() => readBackup(Buffer.from('not gzip')), /isn't a Running Companion backup/);
  assert.throws(() => readBackup(gzipSync(Buffer.alloc(1024))), /no manifest/);
  assert.throws(
    () => readBackup(gzipSync(Buffer.from([]))),
    /no manifest|valid tar/,
  );
  // Newer schema than this version knows.
  await assert.rejects(async () => readBackup(gzipSync(await tarOf([{ name: 'manifest.json', data: manifest(latestSchemaVersion() + 1) }, { name: 'companion.db', data: database }]))), /newer version/);
  // Paths outside the data folder.
  await assert.rejects(async () => readBackup(gzipSync(await tarOf([{ name: 'manifest.json', data: manifest(1) }, { name: 'companion.db', data: database }, { name: '../evil', data: Buffer.from('x') }]))), /Unexpected file/);
  await assert.rejects(async () => readBackup(gzipSync(await tarOf([{ name: 'manifest.json', data: manifest(1) }, { name: 'companion.db', data: database }, { name: 'fit/../../evil.fit', data: Buffer.from('x') }]))), /Unexpected file/);
  // A damaged database.
  await assert.rejects(async () => readBackup(gzipSync(await tarOf([{ name: 'manifest.json', data: manifest(1) }, { name: 'companion.db', data: Buffer.from('garbage'.repeat(200)) }]))), /damaged/);
});

test('automatic backups: one a day, the newest few kept, hand-made ones left alone', async () => {
  const source = dataFolder();
  const dir = join(source.dataDir, 'backups');
  mkdirSync(dir);
  writeFileSync(join(dir, 'running-companion-2026-01-01-00-00-00.tar.gz'), 'by hand');

  for (const day of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) {
    assert.ok(await automaticBackup(dir, source, { version: '1.0.0', keep: 2, today: day }));
  }
  assert.equal(await automaticBackup(dir, source, { version: '1.0.0', keep: 2, today: '2026-10-31' }), null);
  assert.equal(await automaticBackup(dir, source, { version: '1.0.0', keep: 0, today: '2026-11-01' }), null);
  assert.deepEqual(readdirSync(dir).sort(), [
    'running-companion-2026-01-01-00-00-00.tar.gz',
    'running-companion-auto-2026-10-30.tar.gz',
    'running-companion-auto-2026-10-31.tar.gz',
  ]);
  assert.equal(readBackup(readFileSync(join(dir, 'running-companion-auto-2026-10-31.tar.gz'))).fit.length, 0);

  writeFileSync(join(dir, 'notes.txt'), 'not a backup');
  const status = backupStatus(dir);
  assert.equal(status.automatic, 2);
  assert.equal(status.byHand, 1);
  assert.ok(status.latest && Date.now() - Date.parse(status.latest) < 60_000);
  assert.deepEqual(backupStatus(join(dir, 'missing')), { latest: null, automatic: 0, byHand: 0 });
});

test('backup: a consistent snapshot while another connection holds a write transaction', async () => {
  const source = dataFolder();
  const writer = new DatabaseSync(source.dbFile);
  writer.exec('PRAGMA journal_mode = WAL');
  writer.exec('BEGIN');
  writer.exec("INSERT INTO backup_probe VALUES ('uncommitted')");
  const { file } = await writeBackupFile(join(source.dataDir, 'mid.tar.gz'), source, { version: '1.0.0' });
  writer.exec('ROLLBACK');
  writer.close();
  const target = dataFolder();
  restoreBackup(readBackup(readFileSync(file)), target);
  assert.deepEqual(probe(target.dbFile), ['first']);
});
