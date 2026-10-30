import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { transaction, update, upsert } from '@companion/db';
import { GarminHttpError, InvalidApiKeyError } from '@companion/garmin-client';
import { obj } from './convert.ts';
import { saveRaw, type SyncContext } from './context.ts';
import type { CalendarDate } from './dates.ts';
import { extractFitFile, parseActivityFit } from './fit.ts';
import { mapActivityDetail, mapWorkoutName } from './mappers.ts';

export interface DetailSummary {
  processed: number;
  downloaded: number;
  failed: number;
}

/**
 * Second step for activities: detail, planned workout and FIT file (laps + per-second records).
 * Runs for every activity not processed yet, plus recent ones (RPE or names edited after the run).
 * Each activity commits on its own, so an interrupted run loses at most one activity's work.
 */
export async function syncActivityDetails(ctx: SyncContext, refreshFrom: CalendarDate): Promise<DetailSummary> {
  const pending = ctx.db
    .prepare('SELECT activity_id FROM activities WHERE details_synced = 0 OR calendar_date >= ? ORDER BY start_time DESC')
    .all(refreshFrom)
    .map((row) => Number(row.activity_id));

  const summary: DetailSummary = { processed: 0, downloaded: 0, failed: 0 };
  if (pending.length) ctx.log(`  activity details: ${pending.length} to process`);

  for (const [index, activityId] of pending.entries()) {
    try {
      const downloaded = await syncOne(ctx, activityId);
      summary.processed++;
      if (downloaded) summary.downloaded++;
    } catch (error) {
      // A bad key will fail every request: stop instead of logging the same error hundreds of times.
      if (error instanceof InvalidApiKeyError) throw error;
      summary.failed++;
      ctx.log(`  activity ${activityId}: ${error instanceof Error ? error.message : String(error)} (will retry next run)`);
    }
    if ((index + 1) % 25 === 0) ctx.log(`  activity details: ${index + 1}/${pending.length}`);
  }
  return summary;
}

/** Returns true when a FIT file was downloaded (false: already on disk, or the activity has none). */
async function syncOne(ctx: SyncContext, activityId: number): Promise<boolean> {
  const detail = await ctx.api.activity(activityId);
  saveRaw(ctx.db, 'activity-detail', String(activityId), detail);

  const workouts = await ctx.api.activityWorkouts(activityId).catch(notFoundAsNull);
  saveRaw(ctx.db, 'activity-workouts', String(activityId), workouts);

  const relativePath = join('fit', `${activityId}.fit`);
  const absolutePath = join(ctx.dataDir, relativePath);
  let fitBytes: Uint8Array | null = existsSync(absolutePath) ? new Uint8Array(readFileSync(absolutePath)) : null;
  let downloaded = false;

  if (!fitBytes) {
    // Manually entered activities have no file: Garmin answers 404.
    const archive = await ctx.api.downloadActivity(activityId).catch(notFoundAsNull);
    if (archive) {
      fitBytes = extractFitFile(archive);
      mkdirSync(join(ctx.dataDir, 'fit'), { recursive: true });
      writeFileSync(absolutePath, fitBytes);
      downloaded = true;
    }
  }

  const parsed = fitBytes ? parseActivityFit(activityId, fitBytes) : null;
  const detailRow = mapActivityDetail(obj(detail));

  transaction(ctx.db, () => {
    update(ctx.db, 'activities', ['activity_id'], {
      activity_id: activityId,
      ...detailRow,
      rpe: detailRow.rpe ?? parsed?.session.rpe ?? null,
      feel: detailRow.feel ?? parsed?.session.feel ?? null,
      workout_name: mapWorkoutName(workouts),
      fit_path: fitBytes ? relativePath.replaceAll('\\', '/') : null,
      fit_sha256: fitBytes ? createHash('sha256').update(fitBytes).digest('hex') : null,
      details_synced: 1,
      updated_at: Date.now(),
    });

    // Replace rather than merge: a re-processed file is the complete truth for this activity.
    ctx.db.prepare('DELETE FROM activity_laps WHERE activity_id = ?').run(activityId);
    ctx.db.prepare('DELETE FROM activity_records WHERE activity_id = ?').run(activityId);
    for (const lap of parsed?.laps ?? []) upsert(ctx.db, 'activity_laps', ['activity_id', 'lap_index'], lap);
    for (const record of parsed?.records ?? []) upsert(ctx.db, 'activity_records', ['activity_id', 'time'], record);
  });

  return downloaded;
}

function notFoundAsNull(error: unknown): null {
  if (error instanceof GarminHttpError && error.status === 404) return null;
  throw error;
}
