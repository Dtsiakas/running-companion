import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openDatabase } from '@companion/db';
import { runQueryIsolated } from '../src/query.ts';

const dbFile = join(mkdtempSync(join(tmpdir(), 'companion-query-')), 'companion.db');
openDatabase(dbFile).close();

test('isolated query: answers like runQuery', async () => {
  assert.deepEqual(await runQueryIsolated(dbFile, 'SELECT 1 + 1 AS two'), { rows: [{ two: 2 }], row_count: 1, truncated: false });
  assert.deepEqual(await runQueryIsolated(dbFile, 'DELETE FROM activities'), { error: 'Only SELECT (or WITH … SELECT) statements are allowed.' });
  await assert.rejects(runQueryIsolated(dbFile, 'SELECT * FROM no_such_table'), /no such table/);
  await assert.rejects(runQueryIsolated(dbFile, 'WITH x AS (SELECT 1) DELETE FROM activities'), /readonly/);
});

test('isolated query: a runaway query is stopped, and this thread stays free meanwhile', async () => {
  let ticks = 0;
  const interval = setInterval(() => ticks++, 20);
  const started = Date.now();
  const result = (await runQueryIsolated(dbFile, 'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n) SELECT i FROM n WHERE i < 0', 500)) as { error: string };
  clearInterval(interval);
  assert.match(result.error, /longer than 0.5s/);
  assert.ok(Date.now() - started < 3000);
  assert.ok(ticks >= 10, `the main thread ran ${ticks} timers while the query ran`);
});
