import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { memorySettings } from '@companion/config';
import { openDatabase, upsert } from '@companion/db';
import { openReadOnly } from '@companion/jobs';
import { computeMetrics } from '@companion/metrics';
import { createApp, hashPassword, nextRunAfter } from '@companion/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PASSWORD = 'correct horse battery staple';
const dir = mkdtempSync(join(tmpdir(), 'companion-server-'));
const dbFile = join(dir, 'test.db');
let server: Server;
let base: string;
let readDb: DatabaseSync;
let writeDb: DatabaseSync;
let syncCalls = 0;

const passwordHash = await hashPassword(PASSWORD);

before(async () => {
  writeDb = openDatabase(dbFile);
  upsert(writeDb, 'activities', ['activity_id'], {
    activity_id: 1, name: 'Easy', type_key: 'running', start_time: Date.UTC(2026, 9, 27, 16), start_time_local: '2026-10-27T18:00:00',
    calendar_date: '2026-10-27', distance_m: 7200, duration_s: 2400, avg_speed_mps: 3, avg_hr: 145, details_synced: 1, updated_at: 0,
  });
  computeMetrics(writeDb, { today: '2026-10-28' });
  readDb = openReadOnly(dbFile);

  // Listen on port 0 (the OS picks a free port) first: the public URL, which OAuth metadata contains, must match it.
  server = createHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;

  const { app } = createApp({
    config: { publicUrl: new URL(base), port: 0, host: '127.0.0.1', trustProxy: false, syncHours: [6], backupKeep: 0, cartoKey: null, demo: false },
    settings: memorySettings({ passwordHash, sessionSecret: 'x'.repeat(40) }),
    checkGarminKey: async () => 'ok',
    readDb,
    writeDb,
    sync: async () => ({ synced: ++syncCalls }),
    isSyncRunning: () => false,
  });
  server.on('request', app);
});

after(() => {
  server.close();
  readDb.close();
  writeDb.close();
  rmSync(dir, { recursive: true, force: true });
});

const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };
const sessionCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith('companion_session='))?.split(';')[0];

// Dashboard login --------------------------------------------------------------------------------------------

test('the API refuses requests without a session, the health check does not', async () => {
  assert.equal((await fetch(`${base}/api/today`)).status, 401);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test('pages redirect to the login page, which only accepts the right password', async () => {
  const page = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login?next=%2F');

  const wrong = await fetch(`${base}/login`, { method: 'POST', headers: formHeaders, body: form({ password: 'nope', next: '/' }), redirect: 'manual' });
  assert.equal(wrong.status, 401);
  assert.equal(sessionCookie(wrong), undefined);
});

test('logging in gives an HttpOnly session cookie that opens the API', async () => {
  const login = await fetch(`${base}/login`, { method: 'POST', headers: formHeaders, body: form({ password: PASSWORD, next: '/' }), redirect: 'manual' });
  assert.equal(login.status, 303);
  assert.match(login.headers.getSetCookie().join(), /HttpOnly/i);
  assert.match(login.headers.getSetCookie().join(), /SameSite=Lax/i);

  const cookie = sessionCookie(login)!;
  const today = await fetch(`${base}/api/today?date=2026-10-27`, { headers: { cookie } });
  assert.equal(today.status, 200);
  assert.equal((await today.json()).last_run.distance_km, 7.2);

  const invalid = await fetch(`${base}/api/trend?metric=nonsense`, { headers: { cookie } });
  assert.equal(invalid.status, 400);

  assert.deepEqual(await (await fetch(`${base}/api/sync`, { method: 'POST', headers: { cookie } })).json(), { synced: 1 });
  // No CARTO key configured: the maps fall back to OpenStreetMap, and the security policy allows its tiles.
  const map = await fetch(`${base}/api/map`, { headers: { cookie } });
  assert.deepEqual(await map.json(), { provider: 'osm', key: null });
  assert.match(map.headers.get('content-security-policy') ?? '', /img-src[^;]*https:\/\/tile\.openstreetmap\.org/);
});

test('the removed check-in, race and notes endpoints are gone', async () => {
  const login = await fetch(`${base}/login`, { method: 'POST', headers: formHeaders, body: form({ password: PASSWORD, next: '/' }), redirect: 'manual' });
  const cookie = sessionCookie(login)!;
  for (const path of ['/api/journal?from=2026-10-01&to=2026-10-31', '/api/races?today=2026-10-30', '/api/race-plan?today=2026-10-30', '/api/notes']) {
    assert.equal((await fetch(`${base}${path}`, { headers: { cookie } })).status, 404, path);
  }

});

test('a tampered session cookie is rejected', async () => {
  const forged = `companion_session=${Buffer.from(JSON.stringify({ exp: Date.now() + 1e9 })).toString('base64url')}.invalid`;
  assert.equal((await fetch(`${base}/api/today`, { headers: { cookie: forged } })).status, 401);
  // Badly encoded: still just "not logged in", never a server error.
  assert.equal((await fetch(`${base}/api/today`, { headers: { cookie: 'companion_session=%E0%A4%A' } })).status, 401);
});

test('the login redirect only goes to paths on this site', async () => {
  const login = await fetch(`${base}/login`, { method: 'POST', headers: formHeaders, body: form({ password: PASSWORD, next: '//evil.example' }), redirect: 'manual' });
  assert.equal(login.headers.get('location'), '/');
});

// Claude's connector: OAuth + MCP ------------------------------------------------------------------------------

test('/mcp without a token answers 401 and points to the OAuth metadata', async () => {
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') ?? '', /resource_metadata=/);
});

test('full OAuth flow, then the MCP tools over HTTP, then token refresh', async () => {
  // 1. Discovery and dynamic client registration, as Claude does it.
  const metadata = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
  assert.equal(metadata.issuer, `${base}/`);
  const redirectUri = 'https://claude.ai/api/mcp/auth_callback';
  const client = await (
    await fetch(metadata.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }),
    })
  ).json();
  assert.ok(client.client_id);

  // 2. Authorization request with PKCE: the browser lands on our consent page.
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorize = new URL(metadata.authorization_endpoint);
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'companion' })) {
    authorize.searchParams.set(key, value);
  }
  const toConsent = await fetch(authorize, { redirect: 'manual' });
  assert.equal(toConsent.status, 302);
  const consentUrl = new URL(toConsent.headers.get('location')!, base);
  const requestId = consentUrl.searchParams.get('request')!;
  assert.match(await (await fetch(consentUrl)).text(), /Allow Claude\?/);

  // 3. Wrong password: no code. Right password: redirect back to Claude with a code and the same state.
  const wrong = await fetch(`${base}/oauth/consent`, { method: 'POST', headers: formHeaders, body: form({ request: requestId, action: 'approve', password: 'nope' }), redirect: 'manual' });
  assert.equal(wrong.status, 401);
  const approved = await fetch(`${base}/oauth/consent`, { method: 'POST', headers: formHeaders, body: form({ request: requestId, action: 'approve', password: PASSWORD }), redirect: 'manual' });
  assert.equal(approved.status, 303);
  const callback = new URL(approved.headers.get('location')!);
  assert.equal(callback.origin + callback.pathname, redirectUri);
  assert.equal(callback.searchParams.get('state'), 'xyz');
  const code = callback.searchParams.get('code')!;

  // 4. Code → tokens. A wrong PKCE verifier fails; the code works only once.
  const exchange = (codeVerifier: string) =>
    fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: formHeaders,
      body: form({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, client_id: client.client_id, redirect_uri: redirectUri }),
    });
  assert.equal((await exchange('wrong-verifier-wrong-verifier-wrong-verifier-1234')).status, 400);
  const tokens = await (await exchange(verifier)).json();
  assert.ok(tokens.access_token && tokens.refresh_token);
  assert.equal((await exchange(verifier)).status, 400, 'codes are single use');

  // 5. The MCP tools over HTTP with the access token.
  const mcp = new Client({ name: 'test', version: '1' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), { requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } } }));
  const { tools } = await mcp.listTools();
  assert.equal(tools.length, 15);
  const result = await mcp.callTool({ name: 'list_activities', arguments: {} });
  assert.equal(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)[0].distance_km, 7.2);
  await mcp.close();

  // 6. Refresh rotates: the new pair works, the old refresh token doesn't.
  const refresh = (token: string) =>
    fetch(metadata.token_endpoint, { method: 'POST', headers: formHeaders, body: form({ grant_type: 'refresh_token', refresh_token: token, client_id: client.client_id }) });
  const renewed = await (await refresh(tokens.refresh_token)).json();
  assert.ok(renewed.access_token);
  assert.equal((await refresh(tokens.refresh_token)).status, 400);

  // 7. Tokens are stored hashed, never in plain text.
  const stored = writeDb.prepare('SELECT token_hash FROM oauth_tokens').all().map((row) => String(row.token_hash));
  assert.ok(!stored.includes(renewed.access_token) && stored.includes(createHash('sha256').update(renewed.access_token).digest('hex')));
});

test('denying sends the user back to Claude with access_denied', async () => {
  const client = await (
    await fetch(`${base}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Other', redirect_uris: ['https://example.com/cb'], token_endpoint_auth_method: 'none' }) })
  ).json();
  const authorize = new URL(`${base}/authorize`);
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://example.com/cb', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' })) {
    authorize.searchParams.set(key, value);
  }
  const requestId = new URL((await fetch(authorize, { redirect: 'manual' })).headers.get('location')!, base).searchParams.get('request')!;
  const denied = await fetch(`${base}/oauth/consent`, { method: 'POST', headers: formHeaders, body: form({ request: requestId, action: 'deny' }), redirect: 'manual' });
  assert.equal(new URL(denied.headers.get('location')!).searchParams.get('error'), 'access_denied');
});

// Scheduler -------------------------------------------------------------------------------------------------

test('scheduler picks the next configured hour, rolling over to tomorrow', () => {
  const hours = [6, 12, 22];
  assert.equal(nextRunAfter(new Date(2026, 9, 29, 5, 30), hours).getHours(), 6);
  assert.equal(nextRunAfter(new Date(2026, 9, 29, 12, 0), hours).getHours(), 22, 'exactly on the hour counts as passed');
  const tomorrow = nextRunAfter(new Date(2026, 9, 29, 23, 0), hours);
  assert.equal(tomorrow.getDate(), 30);
  assert.equal(tomorrow.getHours(), 6);
});
