import { upsert } from '@companion/db';
import { InvalidApiKeyError } from '@companion/garmin-client';
import { syncActivityDetails, type DetailSummary } from './activities.ts';
import { saveRaw, type SyncContext } from './context.ts';
import { addDays, localToday, type CalendarDate } from './dates.ts';
import { mapProfileSnapshot } from './mappers.ts';
import { activityListStream, dailyWellnessStream, hrvStream, sleepStream, weighInStream } from './streams.ts';
import { walkStream, type RangeStream, type WalkSummary } from './walker.ts';

export const STREAM_NAMES = ['activities', 'daily_wellness', 'sleep', 'hrv', 'weigh_ins'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

export interface SyncOptions {
  /** Backfill no further than this date, and keep going until it even through empty months. */
  since?: CalendarDate;
  /** Limit backfill chunks per stream in this run. */
  maxBackfillChunks?: number;
  /** Re-fetch this many days before the newest synced date. Default 3. */
  lookbackDays?: number;
  /** Only sync these streams. Default: all. */
  only?: StreamName[];
  today?: CalendarDate;
}

export interface SyncSummary {
  streams: WalkSummary[];
  details: DetailSummary | null;
  profile: boolean;
}

const DEFAULT_FLOOR: CalendarDate = '2006-01-01';

export async function runSync(ctx: SyncContext, options: SyncOptions = {}): Promise<SyncSummary> {
  const today = options.today ?? localToday();
  const lookbackDays = options.lookbackDays ?? 3;
  const selected = new Set<StreamName>(options.only ?? STREAM_NAMES);

  const profile = await syncProfile(ctx, today);

  const factories: Record<StreamName, (ctx: SyncContext) => RangeStream> = {
    activities: activityListStream,
    daily_wellness: dailyWellnessStream,
    sleep: sleepStream,
    hrv: hrvStream,
    weigh_ins: weighInStream,
  };

  const streams: WalkSummary[] = [];
  for (const name of STREAM_NAMES) {
    if (!selected.has(name)) continue;
    ctx.log(`${name}…`);
    streams.push(
      await walkStream(ctx.db, factories[name](ctx), {
        today,
        lookbackDays,
        floorDate: options.since ?? DEFAULT_FLOOR,
        exhaustive: options.since !== undefined,
        maxBackfillChunks: options.maxBackfillChunks,
        log: ctx.log,
      }),
    );
  }

  // Last, because it is the slow part (three requests per activity): everything else is already usable.
  let details: DetailSummary | null = null;
  if (selected.has('activities')) {
    ctx.log('activity details and FIT files…');
    details = await syncActivityDetails(ctx, addDays(today, -lookbackDays));
  }

  return { streams, details, profile };
}

/** Zones, max HR, fitness age and weight goal change rarely, so one snapshot per day is enough. */
async function syncProfile(ctx: SyncContext, today: CalendarDate): Promise<boolean> {
  ctx.log('profile…');
  // Each source is optional: one failing endpoint shouldn't lose the others.
  const fetchOrNull = async (name: string, call: () => Promise<unknown>) => {
    try {
      const body = await call();
      saveRaw(ctx.db, name, today, body);
      return body;
    } catch (error) {
      if (error instanceof InvalidApiKeyError) throw error;
      ctx.log(`  ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const settings = await fetchOrNull('profile-settings', () => ctx.api.profileSettings());
  const heartRateZones = await fetchOrNull('heart-rate-zones', () => ctx.api.heartRateZones());
  const fitnessAge = await fetchOrNull('fitness-age', () => ctx.api.fitnessAge(today));
  const weightGoals = await fetchOrNull('weight-goals', () => ctx.api.weightGoals(addDays(today, -1), today));

  if (!settings && !heartRateZones && !fitnessAge && !weightGoals) return false;
  upsert(ctx.db, 'profile_snapshots', ['calendar_date'], mapProfileSnapshot(today, { settings, heartRateZones, fitnessAge, weightGoals }, Date.now()));
  return true;
}
