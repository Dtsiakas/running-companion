import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GarminError, GarminHttpError, HttpClient, type TokenProvider } from '@companion/garmin-client';

function client(answers: Array<Response | Error>, options: { maxRetries?: number } = {}) {
  const calls: string[] = [];
  let refreshes = 0;
  const tokens = { getToken: async (refresh?: boolean) => ((refresh ? refreshes++ : 0), { accessToken: `token-${refreshes}` }) } as unknown as TokenProvider;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push(`${url} ${(init?.headers as Record<string, string>).Authorization}`);
    const next = answers.shift();
    if (!next) throw new Error('no more answers');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { http: new HttpClient({ baseUrl: 'https://garmin.test', tokens, fetch: fetchFn, retryBaseMs: 1, ...options }), calls, refreshes: () => refreshes };
}

const ok = () => new Response('{"ok":true}', { status: 200 });

test('HTTP 429 and 5xx are retried, then succeed', async () => {
  const { http, calls } = client([new Response('', { status: 429 }), new Response('', { status: 503 }), ok()]);
  assert.deepEqual(await http.getJson('/x'), { ok: true });
  assert.equal(calls.length, 3);
});

test('network errors and timeouts are retried too, and reported clearly when they persist', async () => {
  const retried = client([new TypeError('fetch failed'), ok()]);
  assert.deepEqual(await retried.http.getJson('/x'), { ok: true });

  const down = client([new TypeError('fetch failed'), new TypeError('fetch failed')], { maxRetries: 1 });
  await assert.rejects(down.http.getJson('/x'), (error) => error instanceof GarminError && /Couldn't reach Garmin \(\/x\): fetch failed/.test(error.message));
});

test('a 401 gets one fresh token, then gives up', async () => {
  const fixed = client([new Response('', { status: 401 }), ok()]);
  assert.deepEqual(await fixed.http.getJson('/x'), { ok: true });
  assert.equal(fixed.refreshes(), 1);
  assert.match(fixed.calls[1]!, /token-1$/);

  const refused = client([new Response('', { status: 401 }), new Response('nope', { status: 401 })]);
  await assert.rejects(refused.http.getJson('/x'), (error) => error instanceof GarminHttpError && error.status === 401);
});

test('other errors are not retried, and keep Garmin’s message', async () => {
  const { http, calls } = client([new Response('bad date', { status: 400 })]);
  await assert.rejects(http.getJson('/x'), /HTTP 400: bad date/);
  assert.equal(calls.length, 1);
});
