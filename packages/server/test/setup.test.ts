import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { ensureSessionSecret, fileSettings, memorySettings, moveSecretsFromEnvFile, type SettingsStore } from '@companion/config';
import { openDatabase } from '@companion/db';
import { openReadOnly } from '@companion/jobs';
import { createApp, keyStatus, type App } from '@companion/server';

const dir = mkdtempSync(join(tmpdir(), 'companion-setup-'));
const dbFile = join(dir, 'test.db');
let server: Server;
let base: string;
let readDb: DatabaseSync;
let writeDb: DatabaseSync;
let built: App;
let syncs = 0;
const settings: SettingsStore = memorySettings();
ensureSessionSecret(settings);

before(async () => {
  writeDb = openDatabase(dbFile);
  readDb = openReadOnly(dbFile);
  server = createHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  built = createApp({
    config: { publicUrl: new URL(base), port: 0, host: '127.0.0.1', trustProxy: false, syncHours: [6], backupKeep: 0, cartoKey: null, demo: false },
    settings,
    checkGarminKey: async (key) => (key === 'good-key' || key === 'newer-key' ? 'ok' : 'rejected'),
    readDb,
    writeDb,
    sync: async () => ({ synced: ++syncs }),
    isSyncRunning: () => false,
  });
  server.on('request', built.app);
});

after(() => {
  server.close();
  readDb.close();
  writeDb.close();
  rmSync(dir, { recursive: true, force: true });
});

const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };
const post = (fields: Record<string, string>) => fetch(`${base}/setup`, { method: 'POST', headers: formHeaders, body: new URLSearchParams(fields).toString(), redirect: 'manual' });
const cookieOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith('companion_session='))?.split(';')[0];
let cookie = '';

test('before setup, everything leads to the setup page and the API is closed', async () => {
  assert.equal(built.needsSetup(), true);
  const login = await fetch(`${base}/login`, { redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/setup');
  assert.equal((await fetch(`${base}/api/today`)).status, 401);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test('the setup page asks for the code unless the link carries it', async () => {
  assert.match(await (await fetch(`${base}/setup`)).text(), /name="code" type="text"/);
  assert.match(await (await fetch(`${base}/setup?code=${built.setupCode}`)).text(), /type="hidden" name="code"/);
});

test('setup refuses a wrong code, a short or mismatched password and a rejected key, saving nothing', async () => {
  const good = { code: built.setupCode, password: 'a long enough password', repeat: 'a long enough password' };
  assert.match(await (await post({ ...good, code: 'nope' })).text(), /setup code isn’t right/);
  assert.match(await (await post({ ...good, password: 'short', repeat: 'short' })).text(), /at least 12/);
  assert.match(await (await post({ ...good, repeat: 'something else entirely' })).text(), /differ/);
  assert.match(await (await post({ ...good, key: 'bad-key' })).text(), /didn’t accept/);
  assert.equal(settings.read().passwordHash, undefined);
});

test('a complete setup saves everything, logs you in, starts a sync and closes the setup page', async () => {
  const res = await post({ code: built.setupCode, password: 'a long enough password', repeat: 'a long enough password', key: 'good-key', expires: '2027-03-01' });
  assert.equal(res.status, 303);
  cookie = cookieOf(res)!;
  assert.ok(cookie);
  const saved = settings.read();
  assert.ok(saved.passwordHash?.startsWith('scrypt$'));
  assert.equal(saved.garminKey, 'good-key');
  assert.equal(saved.garminKeyExpiresOn, '2027-03-01');
  assert.equal(syncs, 1);
  assert.equal(built.needsSetup(), false);
  assert.equal((await fetch(`${base}/setup`, { redirect: 'manual' })).headers.get('location'), '/');
});

test('settings never send the key back, and a new key is checked before it replaces the old one', async () => {
  const get = await fetch(`${base}/api/settings`, { headers: { cookie } });
  const body = await get.text();
  assert.doesNotMatch(body, /good-key/);
  assert.equal(JSON.parse(body).garmin.source, 'settings');

  const put = (path: string, data: unknown) => fetch(`${base}/api/settings${path}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await put('/garmin-key', { key: 'bad-key' })).status, 422);
  assert.equal(settings.read().garminKey, 'good-key');
  settings.update({ garminKeyRejectedAt: '2026-10-30T10:00:00Z' });
  const replaced = await put('/garmin-key', { key: 'newer-key', expiresOn: null });
  assert.equal(replaced.status, 200);
  assert.equal((await replaced.json()).garmin.state, 'ok');
  assert.equal(settings.read().garminKeyRejectedAt, undefined);
  assert.equal((await put('/garmin-key/expiry', { expiresOn: '2026-02-30' })).status, 422);
});

test('changing the password needs the current one and logs out other browsers', async () => {
  const put = (data: unknown, withCookie = cookie) => fetch(`${base}/api/settings/password`, { method: 'PUT', headers: { cookie: withCookie, 'content-type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await put({ current: 'wrong password!!', next: 'another long password' })).status, 422);
  const changed = await put({ current: 'a long enough password', next: 'another long password' });
  assert.equal(changed.status, 200);
  const fresh = cookieOf(changed)!;
  assert.equal((await fetch(`${base}/api/settings`, { headers: { cookie } })).status, 401, 'the old session ended');
  assert.equal((await fetch(`${base}/api/settings`, { headers: { cookie: fresh } })).status, 200, 'this browser stays in');
});

test('key status: rejected beats dates, and the warning starts two weeks ahead', () => {
  const at = (expiresOn: string, extra = {}) => keyStatus({ garminKey: 'k', garminKeyExpiresOn: expiresOn, ...extra }, '2026-10-31', { fromEnv: false }).state;
  assert.equal(at('2027-01-01'), 'ok');
  assert.equal(at('2026-11-14'), 'expiring');
  assert.equal(at('2026-10-30'), 'expired');
  assert.equal(at('2027-01-01', { garminKeyRejectedAt: '2026-10-31T08:00:00Z' }), 'rejected');
  assert.equal(keyStatus({}, '2026-10-31', { fromEnv: false, keyFile: join(dir, 'none') }).state, 'missing');
});

test('environment variables win over the file and lock their fields', () => {
  const store = memorySettings({ garminKey: 'from-file' }, { GARMIN_PERSONAL_API_KEY: 'from-env' });
  assert.equal(store.read().garminKey, 'from-env');
  assert.throws(() => store.update({ garminKey: 'x' }), /GARMIN_PERSONAL_API_KEY/);
});

test('secrets move from an old .env into the settings file, which only its owner can read', () => {
  const envFile = join(dir, '.env');
  const file = join(dir, 'settings.json');
  writeFileSync(envFile, 'GARMIN_PERSONAL_API_KEY=abc\nPASSWORD_HASH=scrypt$1\nSESSION_SECRET=\nPUBLIC_URL=https://x.example\n');
  assert.deepEqual(moveSecretsFromEnvFile(envFile, file), ['GARMIN_PERSONAL_API_KEY', 'PASSWORD_HASH']);
  assert.equal(readFileSync(envFile, 'utf8'), 'PUBLIC_URL=https://x.example\n');
  const saved = fileSettings(file, {}).read();
  assert.equal(saved.garminKey, 'abc');
  assert.equal(saved.passwordHash, 'scrypt$1');
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(moveSecretsFromEnvFile(envFile, file), [], 'a second run changes nothing');
});

test('demo mode: no setup, no login, and settings are read-only', async () => {
  const demoServer = createHttpServer();
  await new Promise<void>((resolve) => demoServer.listen(0, '127.0.0.1', resolve));
  const demoBase = `http://localhost:${(demoServer.address() as AddressInfo).port}`;
  const demo = createApp({
    config: { publicUrl: new URL(demoBase), port: 0, host: '127.0.0.1', trustProxy: false, syncHours: [6], backupKeep: 0, cartoKey: null, demo: true },
    settings: memorySettings({ sessionSecret: 'y'.repeat(40) }),
    checkGarminKey: async () => 'ok',
    readDb,
    writeDb,
    sync: () => Promise.reject(new Error('demo')),
    isSyncRunning: () => false,
  });
  demoServer.on('request', demo.app);
  try {
    assert.equal(demo.needsSetup(), false);
    assert.equal((await fetch(`${demoBase}/api/today`)).status, 200);
    const read = await fetch(`${demoBase}/api/settings`);
    assert.equal((await read.json()).demo, true);
    const write = await fetch(`${demoBase}/api/settings/garmin-key/expiry`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"expiresOn":null}' });
    assert.equal(write.status, 403);
    assert.equal((await fetch(`${demoBase}/api/sync`, { method: 'POST' })).status, 502);
  } finally {
    demoServer.close();
  }
});

test('server pages follow the browser’s language', async () => {
  const greek = await (await fetch(`${base}/login`, { headers: { 'accept-language': 'el-GR,el;q=0.9' } })).text();
  assert.match(greek, /<html lang="el">/);
  assert.match(greek, /Σύνδεση/);
  const english = await (await fetch(`${base}/login`, { headers: { 'accept-language': 'fr-FR' } })).text();
  assert.match(english, /Log in/);
});
