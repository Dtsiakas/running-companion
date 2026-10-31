import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GarminError, InvalidApiKeyError, TokenProvider } from '@companion/garmin-client';

const jwt = (exp: number) => `x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;

function provider(answers: Array<Response | Error>) {
  let calls = 0;
  const fetchFn = (async () => {
    calls++;
    const next = answers.shift();
    if (!next) throw new Error('no more answers');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { tokens: new TokenProvider({ apiKey: 'key', baseUrl: 'https://garmin.test', fetch: fetchFn, retryBaseMs: 1 }), calls: () => calls };
}

const token = () => new Response(JSON.stringify({ access_token: jwt(Math.floor(Date.now() / 1000) + 86_400) }), { status: 200 });

test('the key exchange retries a dropped connection or a 503, then succeeds', async () => {
  const { tokens, calls } = provider([new TypeError('fetch failed'), new Response('', { status: 503 }), token()]);
  assert.ok((await tokens.getToken()).accessToken.startsWith('x.'));
  assert.equal(calls(), 3);
});

test('the key exchange gives up clearly when Garmin stays unreachable, and never retries a refused key', async () => {
  const down = provider([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')]);
  await assert.rejects(down.tokens.getToken(), (error) => error instanceof GarminError && /Couldn't reach Garmin to sign in/.test(error.message));

  const refused = provider([new Response('bad key', { status: 401 })]);
  await assert.rejects(refused.tokens.getToken(), InvalidApiKeyError);
  assert.equal(refused.calls(), 1);
});
