/**
 * Discovery: calls every Personal API endpoint with your key, saves the raw responses,
 * decodes one activity's FIT file and writes a report of what data is actually available.
 *
 *   npm run discover            (last 7 days)
 *   npm run discover -- --days 14
 *
 * Output goes to data/discovery/ (gitignored: it is your personal health data).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { createGarminApi, daysAgo, GarminError, GarminHttpError, toCalendarDate } from '@companion/garmin-client';
import { DATA_DIR, loadEnv, ROOT, TOKEN_CACHE_FILE } from '@companion/config';
import { extractFitFile, summarizeFit, type FitSummary } from '@companion/sync';
import { describeShape, isEmptyData } from './shape.ts';

loadEnv();

const { values: args } = parseArgs({ options: { days: { type: 'string', default: '7' } } });
const days = Math.max(1, Number(args.days) || 7);

const OUT_DIR = join(DATA_DIR, 'discovery');
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

type Status = 'data' | 'empty' | 'error';

interface ProbeResult {
  name: string;
  area: string;
  status: Status;
  detail: string;
  ms: number;
}

const results: ProbeResult[] = [];

let garmin: ReturnType<typeof createGarminApi>;
try {
  garmin = createGarminApi({ tokenCacheFile: TOKEN_CACHE_FILE });
  await garmin.tokens.getToken();
  console.log('✓ Authenticated with Garmin\n');
} catch (error) {
  console.error(`✗ ${error instanceof GarminError ? error.message : String(error)}`);
  process.exit(1);
}
const { api } = garmin;

const today = new Date();
const yesterday = daysAgo(1, today);
const rangeStart = daysAgo(days, today);

async function probe(area: string, name: string, call: () => Promise<unknown>): Promise<unknown> {
  const started = performance.now();
  try {
    const value = await call();
    const ms = Math.round(performance.now() - started);
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(value, null, 2));
    const status: Status = isEmptyData(value) ? 'empty' : 'data';
    record({ area, name, status, detail: describeShape(value), ms });
    return value;
  } catch (error) {
    const ms = Math.round(performance.now() - started);
    const detail = error instanceof GarminHttpError ? `HTTP ${error.status} ${error.responseText.slice(0, 120)}` : String(error);
    record({ area, name, status: 'error', detail, ms });
    return undefined;
  }
}

function record(result: ProbeResult): void {
  results.push(result);
  const icon = { data: '✓', empty: '○', error: '✗' }[result.status];
  console.log(`${icon} ${result.area.padEnd(12)} ${result.name.padEnd(28)} ${result.detail.slice(0, 90)}`);
}

// Health and profile --------------------------------------------------------------------

await probe('profile', 'profile-settings', () => api.profileSettings());
await probe('profile', 'heart-rate-zones', () => api.heartRateZones());
await probe('profile', 'fitness-age', () => api.fitnessAge(yesterday));

await probe('daily', 'daily-summaries', () => api.dailySummaries(rangeStart, today));
await probe('daily', 'steps', () => api.dailySteps(rangeStart, today));
await probe('daily', 'stress', () => api.dailyStress(rangeStart, today));
await probe('daily', 'hydration', () => api.dailyHydration(rangeStart, today));
await probe('daily', 'body-battery', () => api.bodyBattery(rangeStart, today));
await probe('daily', 'wellness-activities', () => api.wellnessActivitySummaries(rangeStart, today));

// Garmin files last night's sleep under today's date.
await probe('sleep', 'sleep-last-night', () => api.dailySleep(today));
await probe('sleep', 'sleep-summaries', () => api.sleepSummaries(rangeStart, today));
await probe('heart', 'heart-rate-yesterday', () => api.dailyHeartRate(yesterday));
await probe('heart', 'hrv-today', () => api.hrv(today));
await probe('heart', 'hrv-summaries', () => api.hrvSummaries(rangeStart, today));
await probe('heart', 'spo2-yesterday', () => api.spo2(yesterday));

// Wider window for body composition: weigh-ins are rarer than daily data.
await probe('body', 'weight-90d', () => api.weightMeasurements(daysAgo(90, today), today));
await probe('body', 'weight-goals', () => api.weightGoals(daysAgo(90, today), today));
await probe('nutrition', 'food-logs-yesterday', () => api.foodLogs(yesterday));

// Activities ----------------------------------------------------------------------------

const activities = await probe('activities', 'activities-30d', () =>
  api.searchActivities({ startDate: daysAgo(30, today), endDate: today, limit: 50 }),
);

let fit: { activityId: number; name: string; summary: FitSummary } | undefined;
const run = pickRun(activities);

if (run) {
  await probe('activities', 'activity-detail', () => api.activity(run.id));
  await probe('activities', 'activity-workouts', () => api.activityWorkouts(run.id));

  const started = performance.now();
  try {
    const zip = await api.downloadActivity(run.id);
    writeFileSync(join(OUT_DIR, `activity-${run.id}.zip`), zip);
    const summary = summarizeFit(extractFitFile(zip));
    writeFileSync(join(OUT_DIR, 'fit-summary.json'), JSON.stringify(summary, null, 2));
    fit = { activityId: run.id, name: run.name, summary };
    record({
      area: 'activities',
      name: 'fit-download',
      status: 'data',
      detail: `${summary.messageCounts.recordMesgs ?? 0} records, ${Object.keys(summary.recordFieldCoverage).length} record fields`,
      ms: Math.round(performance.now() - started),
    });
  } catch (error) {
    const detail = error instanceof GarminHttpError ? `HTTP ${error.status}` : String(error);
    record({ area: 'activities', name: 'fit-download', status: 'error', detail, ms: Math.round(performance.now() - started) });
  }
} else {
  console.log('\n(No activities in the last 30 days, so activity detail and FIT download were skipped.)');
}

// Report ----------------------------------------------------------------------------------

const reportFile = join(OUT_DIR, 'REPORT.md');
writeFileSync(reportFile, buildReport());
writeFileSync(join(OUT_DIR, 'inventory.json'), JSON.stringify({ generatedAt: new Date().toISOString(), days, results, fit }, null, 2));

const count = (status: Status) => results.filter((r) => r.status === status).length;
console.log(`\n${count('data')} with data, ${count('empty')} empty, ${count('error')} errors.`);
console.log(`Report: ${relative(ROOT, reportFile)}`);

// Helpers -----------------------------------------------------------------------------------

function pickRun(list: unknown): { id: number; name: string } | undefined {
  if (!Array.isArray(list)) return undefined;
  const items = list as Array<{ activityId?: number; activityName?: string; activityType?: { typeKey?: string } }>;
  const chosen = items.find((a) => a.activityType?.typeKey?.includes('running')) ?? items[0];
  return chosen?.activityId ? { id: chosen.activityId, name: chosen.activityName ?? 'Activity' } : undefined;
}

function buildReport(): string {
  const lines = [
    '# Garmin Personal API discovery',
    '',
    `Generated ${new Date().toLocaleString()} · range ${toCalendarDate(rangeStart)} to ${toCalendarDate(today)}`,
    '',
    'Legend: ✓ returned data · ○ responded but empty · ✗ error',
    '',
    '| | Area | Endpoint | Result | ms |',
    '|---|---|---|---|---|',
    ...results.map(
      (r) => `| ${{ data: '✓', empty: '○', error: '✗' }[r.status]} | ${r.area} | ${r.name} | ${r.detail.replaceAll('|', '\\|')} | ${r.ms} |`,
    ),
    '',
  ];

  if (fit) {
    const { summary } = fit;
    lines.push(
      `## FIT file: ${fit.name} (${fit.activityId})`,
      '',
      '### Message types',
      '',
      ...Object.entries(summary.messageCounts).map(([name, n]) => `- ${name}: ${n}`),
      '',
      '### Per-second record fields (coverage %)',
      '',
      ...Object.entries(summary.recordFieldCoverage).map(([name, pct]) => `- ${name}: ${pct}%`),
      '',
      '### Developer fields',
      '',
      ...(summary.developerFields.length ? summary.developerFields.map((f) => `- ${f}`) : ['- none']),
      '',
      '### Session summary fields',
      '',
      ...Object.entries(summary.session ?? {})
        .filter(([, value]) => value !== undefined && (typeof value !== 'object' || value instanceof Date))
        .map(([name, value]) => `- ${name}: ${value instanceof Date ? value.toISOString() : String(value)}`),
      '',
    );
    if (summary.errors.length) lines.push('### Decoder errors', '', ...summary.errors.map((e) => `- ${e}`), '');
  }

  return lines.join('\n');
}
