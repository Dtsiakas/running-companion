import { transaction, upsert, type Row } from '@companion/db';
import { arr, obj, str } from './convert.ts';
import { saveRaw, type SyncContext } from './context.ts';
import type { CalendarDate } from './dates.ts';
import { mapActivityListItem, mapDailySummary, mapHrv, mapSleep, mapWeighIns } from './mappers.ts';
import type { RangeStream } from './walker.ts';

/** Writes rows in one transaction: a chunk lands completely or not at all. */
function store(ctx: SyncContext, table: string, keys: string[], rows: (Row | null)[]): number {
  const valid = rows.filter((row): row is Row => row !== null);
  transaction(ctx.db, () => valid.forEach((row) => upsert(ctx.db, table, keys, row)));
  return valid.length;
}

export function dailyWellnessStream(ctx: SyncContext): RangeStream {
  return {
    name: 'daily_wellness',
    chunkDays: 28,
    maxEmptyChunks: 3,
    async syncRange(start, end) {
      const response = await ctx.api.dailySummaries(start, end);
      saveRaw(ctx.db, 'daily-summaries', `${start}_${end}`, response);
      const now = Date.now();
      return { stored: store(ctx, 'daily_wellness', ['calendar_date'], arr(obj(response).data).map((day) => mapDailySummary(day, now))) };
    },
  };
}

export function sleepStream(ctx: SyncContext): RangeStream {
  return {
    name: 'sleep',
    chunkDays: 28,
    maxEmptyChunks: 3,
    async syncRange(start, end) {
      const response = await ctx.api.sleepSummaries(start, end);
      saveRaw(ctx.db, 'sleep-summaries', `${start}_${end}`, response);
      const now = Date.now();
      return { stored: store(ctx, 'sleep', ['calendar_date'], arr(response).map((night) => mapSleep(night, now))) };
    },
  };
}

export function hrvStream(ctx: SyncContext): RangeStream {
  return {
    name: 'hrv',
    chunkDays: 28,
    maxEmptyChunks: 3,
    async syncRange(start, end) {
      const response = await ctx.api.hrvSummaries(start, end);
      saveRaw(ctx.db, 'hrv-summaries', `${start}_${end}`, response);
      const now = Date.now();
      return { stored: store(ctx, 'hrv', ['calendar_date'], arr(obj(response).hrvSummaries).map((night) => mapHrv(night, now))) };
    },
  };
}

export function weighInStream(ctx: SyncContext): RangeStream {
  return {
    name: 'weigh_ins',
    chunkDays: 90,
    maxEmptyChunks: 4,
    async syncRange(start, end) {
      const response = obj(await ctx.api.weightMeasurements(start, end));
      saveRaw(ctx.db, 'weight-range', `${start}_${end}`, response);
      const stored = store(ctx, 'weigh_ins', ['sample_pk'], mapWeighIns(response, Date.now()));
      // Garmin tells us the most recent weigh-in before the range: none means there's no older history.
      const previous = obj(response.previousDateWeight);
      return { stored, noOlderData: !str(previous.calendarDate) };
    },
  };
}

/** Lists activities into the activities table. Details and FIT files are a separate step (see activities.ts). */
export function activityListStream(ctx: SyncContext): RangeStream {
  const PAGE_SIZE = 100;
  return {
    name: 'activities',
    chunkDays: 28,
    // Long training breaks shouldn't end the backfill: 26 empty chunks × 28 days ≈ 24 months.
    maxEmptyChunks: 26,
    async syncRange(start: CalendarDate, end: CalendarDate) {
      let stored = 0;
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await ctx.api.searchActivities({ startDate: start, endDate: end, start: offset, limit: PAGE_SIZE });
        saveRaw(ctx.db, 'activities-search', `${start}_${end}_${offset}`, page);
        const items = arr(page);
        const now = Date.now();
        stored += store(ctx, 'activities', ['activity_id'], items.map((item) => mapActivityListItem(item, now)));
        if (items.length < PAGE_SIZE) break;
      }
      return { stored };
    },
  };
}
