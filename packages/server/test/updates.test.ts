import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareVersions, RELEASES_URL, updateChecker } from '../src/updates.ts';

test('versions compare by number, and a pre-release is older than its release', () => {
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.ok(compareVersions('v1.0.0', '0.99.0') > 0);
  assert.equal(compareVersions('0.3.0', 'v0.3.0'), 0);
  assert.ok(compareVersions('0.3.0-beta.1', '0.3.0') < 0);
  assert.ok(compareVersions('0.2.1', '0.3.0') < 0);
});

test('the update check asks GitHub only when turned on, and sends nothing but its name and version', async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  let enabled = false;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers as Record<string, string> });
    return new Response(JSON.stringify({ tag_name: 'v0.4.0', html_url: 'https://github.com/x/releases/v0.4.0' }));
  }) as unknown as typeof fetch;
  const checker = updateChecker({ enabled: () => enabled, current: '0.3.0', fetch: fetchFn });

  await checker.check();
  assert.equal(calls.length, 0, 'off: no request at all');
  assert.equal(checker.available(), false);

  enabled = true;
  await checker.check();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, RELEASES_URL);
  assert.deepEqual(Object.keys(calls[0]!.headers).sort(), ['Accept', 'User-Agent']);
  assert.equal(calls[0]!.headers['User-Agent'], 'running-companion/0.3.0');
  assert.equal(checker.available(), true);
  assert.equal(checker.state().latest, '0.4.0');
});

test('a failed check is kept, not thrown, and keeps the last known version', async () => {
  let fail = false;
  const fetchFn = (async () => (fail ? new Response('', { status: 503 }) : new Response(JSON.stringify({ tag_name: 'v0.3.0' })))) as unknown as typeof fetch;
  const checker = updateChecker({ enabled: () => true, current: '0.3.0', fetch: fetchFn });
  await checker.check();
  assert.equal(checker.available(), false, 'same version: nothing to update');
  fail = true;
  await checker.check();
  assert.equal(checker.state().error, 'GitHub answered 503');
  assert.equal(checker.state().latest, '0.3.0');
});
