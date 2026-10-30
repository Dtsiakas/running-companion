import { DATA_DIR, garminKey, settings, TOKEN_CACHE_FILE } from '@companion/config';
import { openDatabase } from '@companion/db';
import { createGarminApi, InvalidApiKeyError } from '@companion/garmin-client';
import { computeMetrics } from '@companion/metrics';
import { runSync } from '@companion/sync';
import { syncWeather, type WeatherSyncResult } from '@companion/weather';

export interface SyncJobResult {
  startedAt: string;
  seconds: number;
  stored: Record<string, number>;
  activityDetails: { processed: number; downloaded: number; failed: number } | null;
  metricsRecomputed: { activities: number; days: number };
  /** Null when the weather service couldn't be reached at all; the rest of the sync is unaffected. */
  weather: WeatherSyncResult | null;
  note: string;
}

let running: Promise<SyncJobResult> | null = null;

/**
 * Incremental Garmin sync plus metrics, on its own write connection.
 * Single-flight: a call while a sync is running gets that same run's result instead of starting a second one,
 * so the scheduler, the dashboard button and a chat request can never write at the same time.
 */
export function syncNow(dbFile: string): Promise<SyncJobResult> {
  running ??= run(dbFile).finally(() => {
    running = null;
  });
  return running;
}

export function isSyncRunning(): boolean {
  return running !== null;
}

/** Best effort: a settings file that can't be written must not turn a sync result into a failure. */
function markKey(patch: { garminKeyRejectedAt: string | null }): void {
  try {
    settings().update(patch);
  } catch {
    // Ignored on purpose.
  }
}

async function run(dbFile: string): Promise<SyncJobResult> {
  const started = Date.now();
  const db = openDatabase(dbFile);
  try {
    const { api } = createGarminApi({ apiKey: garminKey(), tokenCacheFile: TOKEN_CACHE_FILE, minIntervalMs: 250 });
    // Progress lines are dropped: under the MCP stdio transport, stdout belongs to the protocol.
    const summary = await runSync({ db, api, dataDir: DATA_DIR, log: () => {} }).catch((error: unknown) => {
      // Remembered so the app can say so: otherwise a dead key only shows as data that quietly stops updating.
      if (error instanceof InvalidApiKeyError) markKey({ garminKeyRejectedAt: new Date().toISOString() });
      throw error;
    });
    if (settings().read().garminKeyRejectedAt) markKey({ garminKeyRejectedAt: null });
    const metrics = computeMetrics(db);
    // Weather is extra: a network problem with Open-Meteo must never fail the Garmin sync.
    const weather = await syncWeather(db, fetch).catch(() => null);
    return {
      startedAt: new Date(started).toISOString(),
      seconds: Math.round((Date.now() - started) / 1000),
      stored: Object.fromEntries(summary.streams.map((stream) => [stream.stream, stream.stored])),
      activityDetails: summary.details,
      metricsRecomputed: { activities: metrics.activities, days: metrics.days },
      weather,
      note: 'Counts include the last 3 days, which are always re-fetched because Garmin finalises them late.',
    };
  } finally {
    db.close();
  }
}
