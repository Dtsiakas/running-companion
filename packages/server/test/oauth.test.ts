import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '@companion/db';
import { CompanionOAuthProvider } from '../src/auth/oauth-provider.ts';

test('pruning drops expired tokens and month-old clients that hold none, never a client in use', () => {
  const db = openDatabase(':memory:');
  const oauth = new CompanionOAuthProvider(db);
  const DAY = 86_400_000;
  const now = Date.now();
  const client = (id: string, createdAt: number) =>
    db.prepare('INSERT INTO oauth_clients (client_id, client_json, created_at) VALUES (?, ?, ?)').run(id, JSON.stringify({ client_id: id, redirect_uris: [] }), createdAt);
  const token = (hash: string, clientId: string, expiresAt: number) =>
    db.prepare("INSERT INTO oauth_tokens (token_hash, kind, client_id, scopes, resource, expires_at, created_at) VALUES (?, 'refresh', ?, 'companion', NULL, ?, ?)").run(hash, clientId, expiresAt, now);

  client('abandoned', now - 40 * DAY);
  client('connected', now - 40 * DAY);
  client('lapsed', now - 40 * DAY);
  client('new', now - DAY);
  token('live', 'connected', now + DAY);
  token('expired', 'lapsed', now - DAY);

  oauth.pruneExpired();
  const ids = db.prepare('SELECT client_id FROM oauth_clients ORDER BY client_id').all().map((row) => row.client_id);
  assert.deepEqual(ids, ['connected', 'new']);
  assert.deepEqual(db.prepare('SELECT token_hash FROM oauth_tokens').all().map((row) => row.token_hash), ['live']);
});
