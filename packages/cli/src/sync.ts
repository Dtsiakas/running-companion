/**
 * Syncs Garmin data into data/companion.db.
 *
 *   npm run sync                          first run: backfills all history; later runs: only what's new
 *   npm run sync -- --since 2024-01-01    backfill down to this date, even through empty months
 *   npm run sync -- --only sleep,hrv      only some streams
 *   npm run sync -- --max-chunks 5        limit backfill per stream in this run (it resumes next time)
 */
import { parseArgs } from 'node:util';
import { openDatabase } from '@companion/db';
import { createGarminApi, GarminError } from '@companion/garmin-client';
import { computeMetrics } from '@companion/metrics';
import { runSync, STREAM_NAMES, tableStats, type StreamName } from '@companion/sync';
import { DATA_DIR, DB_FILE, loadEnv, TOKEN_CACHE_FILE } from '@companion/config';

loadEnv();

const { values: args } = parseArgs({
  options: {
    since: { type: 'string' },
    only: { type: 'string' },
    'max-chunks': { type: 'string' },
    delay: { type: 'string', default: '250' },
  },
});

if (args.since && !/^\d{4}-\d{2}-\d{2}$/.test(args.since)) fail(`--since must be YYYY-MM-DD, got "${args.since}"`);
const only = args.only?.split(',').map((name) => name.trim()) as StreamName[] | undefined;
const unknown = only?.filter((name) => !STREAM_NAMES.includes(name));
if (unknown?.length) fail(`Unknown stream(s): ${unknown.join(', ')}. Choose from: ${STREAM_NAMES.join(', ')}`);

const started = Date.now();
const db = openDatabase(DB_FILE);

try {
  const { api } = createGarminApi({ tokenCacheFile: TOKEN_CACHE_FILE, minIntervalMs: Number(args.delay) });
  const summary = await runSync(
    { db, api, dataDir: DATA_DIR, log: (message) => console.log(message) },
    {
      since: args.since,
      only,
      maxBackfillChunks: args['max-chunks'] ? Number(args['max-chunks']) : undefined,
    },
  );

  console.log('metrics…');
  const metrics = computeMetrics(db, { log: (message) => console.log(message) });

  console.log('\nSync finished in', formatDuration(Date.now() - started));
  for (const stream of summary.streams) {
    const backfill = stream.backfillDone ? `history complete from ${stream.oldest}` : `backfill continues from ${stream.oldest}`;
    console.log(`  ${stream.stream.padEnd(15)} ${String(stream.stored).padStart(6)} stored, ${stream.requests} requests, ${backfill}`);
  }
  if (summary.details) {
    const { processed, downloaded, failed } = summary.details;
    console.log(`  activity details ${processed} processed, ${downloaded} FIT files downloaded${failed ? `, ${failed} failed (retried next run)` : ''}`);
  }

  console.log(`  metrics          ${metrics.activities} activities, ${metrics.days} days`);

  console.log('\nDatabase contents:');
  for (const { table, rows, from, to } of tableStats(db)) {
    console.log(`  ${table.padEnd(18)} ${String(rows).padStart(9)} rows${from ? `  ${from} → ${to}` : ''}`);
  }
} catch (error) {
  console.error(`\n✗ ${error instanceof GarminError ? error.message : error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  console.error('Progress so far is saved. Run the sync again to continue.');
  process.exitCode = 1;
} finally {
  db.close();
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
