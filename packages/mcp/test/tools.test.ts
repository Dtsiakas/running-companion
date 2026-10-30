import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, test } from 'node:test';
import { openDatabase, upsert } from '@companion/db';
import { openReadOnly } from '@companion/jobs';
import { createMcpServer } from '@companion/mcp';
import { computeMetrics } from '@companion/metrics';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { runQuery } from '@companion/queries';

const dir = mkdtempSync(join(tmpdir(), 'running-companion-mcp-'));
const dbFile = join(dir, 'test.db');
let client: Client;
let server: McpServer;
let readOnly: DatabaseSync;
let writable: DatabaseSync;

/** A tiny synthetic history: one 40-minute easy run at 3 m/s and HR 145, a profile and a night of sleep. */
function seed(): void {
  const db = openDatabase(dbFile);
  const start = Date.UTC(2026, 9, 27, 16);
  upsert(db, 'profile_snapshots', ['calendar_date'], { calendar_date: '2026-10-27', max_hr: 189, resting_hr_used: 38, lactate_threshold_hr: 170, updated_at: 0 });
  upsert(db, 'activities', ['activity_id'], {
    activity_id: 1,
    name: 'Easy',
    type_key: 'running',
    start_time: start,
    start_time_local: '2026-10-27T18:00:00',
    calendar_date: '2026-10-27',
    workout_name: 'Base',
    distance_m: 7200,
    duration_s: 2400,
    avg_speed_mps: 3,
    avg_hr: 145,
    details_synced: 1,
    updated_at: 0,
  });
  for (let s = 0; s < 2400; s++) {
    upsert(db, 'activity_records', ['activity_id', 'time'], { activity_id: 1, time: start + s * 1000, hr: 145, speed_mps: 3, distance_m: s * 3 });
  }
  upsert(db, 'sleep', ['calendar_date'], { calendar_date: '2026-10-28', sleep_s: 7 * 3600, need_actual_min: 480, updated_at: 0 });
  computeMetrics(db, { today: '2026-10-28' });
  db.close();
}

before(async () => {
  seed();
  readOnly = openReadOnly(dbFile);
  writable = openDatabase(dbFile);
  server = createMcpServer({ db: readOnly, writeDb: writable, sync: async () => ({ synced: true }) });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(clientTransport);
});

after(async () => {
  await client.close();
  await server.close();
  readOnly.close();
  writable.close();
  rmSync(dir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ text: string }>)[0]!.text;
  return { isError: result.isError === true, text, json: () => JSON.parse(text) };
}

test('lists every tool and sends usage instructions', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    [
      'describe_data',
      'get_activity',
      'get_best_efforts',
      'get_body_report',
      'get_insights',
      'get_progress',
      'get_run_forecast',
      'get_sleep_stress_report',
      'get_today',
      'get_trend',
      'get_weekly_report',
      'get_weekly_summary',
      'list_activities',
      'query',
      'sync_garmin',
    ],
  );
  assert.match(client.getInstructions() ?? '', /describe_data/);
});

test('get_today combines recovery, training and the last run', async () => {
  const today = (await call('get_today')).json();
  assert.equal(today.date, '2026-10-28');
  assert.equal(today.recovery.sleep_h, 7);
  assert.equal(today.last_run.pace, '5:33/km');
  assert.equal(today.last_run.category, 'easy');
});

test('activities come back formatted for a runner', async () => {
  const [run] = (await call('list_activities', { category: 'easy' })).json();
  assert.equal(run.distance_km, 7.2);
  assert.equal(run.duration, '40:00');
  assert.equal(run.pace_at_ref_hr, '5:33/km');
  assert.deepEqual(run.intensity_pct, { low: 100, moderate: 0, high: 0 });
});

test('query answers SELECTs and rejects anything else', async () => {
  assert.deepEqual((await call('query', { sql: 'SELECT COUNT(*) AS n FROM activity_records' })).json().rows, [{ n: 2400 }]);
  assert.match((await call('query', { sql: 'DELETE FROM activities' })).text, /Only SELECT/);
  assert.match((await call('query', { sql: 'SELECT 1; DROP TABLE activities' })).text, /One statement/);
  assert.equal((await call('query', { sql: 'SELECT * FROM missing' })).isError, true);
});

test('the read-only connection blocks writes even if a statement slips past the checks', () => {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  assert.throws(() => runQuery(db, 'WITH x AS (SELECT 1) DELETE FROM activities'), /readonly/);
  db.close();
});

test('describe_data includes the thresholds and the schema', async () => {
  const text = (await call('describe_data')).text;
  assert.match(text, /lactate threshold HR \(LTHR\) 170/);
  assert.match(text, /"activity_metrics": "activity_id INTEGER/);
});

test('sync_garmin runs the injected sync', async () => {
  assert.deepEqual((await call('sync_garmin')).json(), { synced: true });
});

test('get_insights returns signals and patterns for the latest day', async () => {
  const insights = (await call('get_insights')).json();
  assert.equal(insights.date, '2026-10-28');
  assert.ok(Array.isArray(insights.signals));
  assert.ok(insights.patterns.some((p: { id: string }) => p.id === 'bedtime'));
});
