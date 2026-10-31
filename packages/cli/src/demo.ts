/**
 * Runs the app on generated data: no Garmin key, no password, nothing of yours. For trying it out, for screenshots,
 * and for seeing how the app copes when a watch doesn't record something.
 *
 *   npm run demo                                  three years of a made-up runner, on http://localhost:8788
 *   npm run demo -- --missing hrv,power,scale      the same runner without those streams
 *   npm run demo -- --days 42                      a newcomer: six weeks of history
 *   npm run demo -- --generate-only                write the database and stop
 *
 * Streams that can be left out: dynamics, power, hrv, scale, battery-events, sleep, gps, fitness-age.
 * Each combination gets its own folder under .demo/ (or COMPANION_DEMO_DIR) and is made again when the day changes,
 * also while it runs: a demo left on for weeks (a public one, say) always ends today. HOST, PUBLIC_URL and TRUST_PROXY
 * pass through, so the same command serves a demo behind a proxy or from a container.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT } from '@companion/config';
import { openDatabase } from '@companion/db';
import { generateDemo, MISSING_STREAMS, todayIn, type MissingStream } from '@companion/demo';
import { computeMetrics } from '@companion/metrics';

/** Bump when the generator changes, so old demo databases are made again. */
const GENERATOR_VERSION = 2;

const { values: args } = parseArgs({
  options: {
    missing: { type: 'string', default: '' },
    days: { type: 'string', default: String(3 * 365) },
    port: { type: 'string', default: '8788' },
    'generate-only': { type: 'boolean', default: false },
  },
});

const missing = args.missing.split(',').map((s) => s.trim()).filter(Boolean);
const unknown = missing.filter((stream) => !(MISSING_STREAMS as readonly string[]).includes(stream));
if (unknown.length) {
  console.error(`✗ Unknown stream${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Choose from: ${MISSING_STREAMS.join(', ')}`);
  process.exit(1);
}
const days = Number(args.days);
if (!Number.isInteger(days) || days < 7 || days > 3650) {
  console.error('✗ --days takes a whole number from 7 to 3650.');
  process.exit(1);
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const name = [missing.length ? `without-${[...missing].sort().join('-')}` : 'full', days === 3 * 365 ? '' : `${days}d`].filter(Boolean).join('-');
const dataDir = join(process.env.COMPANION_DEMO_DIR ?? join(ROOT, '.demo'), name);
const dbFile = join(dataDir, 'companion.db');
const stampFile = join(dataDir, 'demo.json');

/** Makes the demo database for `today`, unless the one on disk already is. */
function prepare(today: string): void {
  const stamp = JSON.stringify({ version: GENERATOR_VERSION, today, timeZone, missing: [...missing].sort(), days });
  if (existsSync(dbFile) && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp) return;
  console.log(`Generating demo data (${name}, up to ${today})…`);
  const started = Date.now();
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(dbFile);
  const summary = generateDemo(db, { today, days, timeZone, missing: missing as MissingStream[] });
  computeMetrics(db, { today });
  db.close();
  writeFileSync(stampFile, stamp);
  console.log(`✓ ${summary.runs} runs from ${summary.from}, in ${Math.round((Date.now() - started) / 1000)}s`);
}

let today = todayIn(timeZone);
prepare(today);

if (args['generate-only']) {
  console.log(`  ${dbFile}`);
  process.exit(0);
}

if (!existsSync(join(ROOT, 'packages', 'web', 'dist', 'index.html'))) {
  console.error('✗ Build the dashboard first: npm run build');
  process.exit(1);
}

let server: ChildProcess | null = null;
let stopping = false;

function start(): void {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join('packages', 'server', 'src', 'main.ts')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      COMPANION_DATA_DIR: dataDir,
      DEMO_MODE: 'true',
      PORT: args.port,
      PUBLIC_URL: process.env.PUBLIC_URL ?? `http://localhost:${args.port}`,
      HOST: process.env.HOST ?? '127.0.0.1',
      TRUST_PROXY: process.env.TRUST_PROXY ?? 'false',
      // The demo must never pick up a real key or password from .env.
      GARMIN_PERSONAL_API_KEY: '',
      PASSWORD_HASH: '',
    },
  });
  server.on('exit', (code) => {
    if (stopping) process.exit(code ?? 0);
  });
}

/** A new day: stop, make the new day's data, start again. Takes about as long as the first start. */
function refresh(): void {
  const now = todayIn(timeZone);
  if (now === today || !server) return;
  today = now;
  const old = server;
  server = null;
  old.once('exit', () => {
    prepare(today);
    start();
  });
  old.kill('SIGINT');
}

start();
setInterval(refresh, 10 * 60_000);

const stop = () => {
  stopping = true;
  if (server) server.kill('SIGINT');
  else process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
