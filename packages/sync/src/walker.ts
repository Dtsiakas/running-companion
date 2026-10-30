import type { Database } from '@companion/db';
import { GarminHttpError } from '@companion/garmin-client';
import { addDays, daysBetween, maxDate, minDate, type CalendarDate } from './dates.ts';

export interface RangeResult {
  /** Items stored for this range. Zero counts towards the "no more history" streak. */
  stored: number;
  /** The stream knows for certain there is nothing older (e.g. weight's previousDateWeight is null). */
  noOlderData?: boolean;
  /** Set by the splitter: Garmin refused every single day up to and including this date. */
  refusedThrough?: CalendarDate;
}

/** A data stream fetched by date range: daily wellness, sleep, HRV, weigh-ins, activities. */
export interface RangeStream {
  name: string;
  /** Days per request. Garmin doesn't document range limits; requests that fail with HTTP 400 are split. */
  chunkDays: number;
  /** Consecutive empty chunks after which the backfill assumes it has reached the start of your history. */
  maxEmptyChunks: number;
  syncRange(start: CalendarDate, end: CalendarDate): Promise<RangeResult>;
}

export interface WalkOptions {
  today: CalendarDate;
  /** Days before the newest synced date to fetch again, because Garmin finalises some data late. */
  lookbackDays: number;
  /** Never backfill before this date. With `exhaustive`, keep going until it even through empty chunks. */
  floorDate: CalendarDate;
  exhaustive?: boolean;
  /** Stop backfilling after this many chunks in one run (the next run continues). */
  maxBackfillChunks?: number;
  log?: (message: string) => void;
}

interface StreamState {
  newest_date: CalendarDate | null;
  oldest_date: CalendarDate | null;
  backfill_done: number;
  empty_streak: number;
}

export interface WalkSummary {
  stream: string;
  stored: number;
  requests: number;
  oldest: CalendarDate | null;
  backfillDone: boolean;
}

/**
 * Brings one stream up to date, in two phases:
 *  1. forward: from (newest synced − lookback) to today, so new and late-finalised data lands;
 *  2. backfill: from the oldest synced date backwards, chunk by chunk, until history runs out.
 * State is saved after every chunk, so an interrupted run resumes where it stopped.
 */
export async function walkStream(db: Database, stream: RangeStream, options: WalkOptions): Promise<WalkSummary> {
  const log = options.log ?? (() => {});
  const summary: WalkSummary = { stream: stream.name, stored: 0, requests: 0, oldest: null, backfillDone: false };
  let state = loadState(db, stream.name);

  const run = async (start: CalendarDate, end: CalendarDate): Promise<RangeResult> => {
    const result = await syncAdaptive(stream, start, end, () => summary.requests++);
    summary.stored += result.stored;
    return result;
  };

  // Phase 1: forward ----------------------------------------------------------------------------
  if (state.newest_date) {
    const from = addDays(state.newest_date, -options.lookbackDays);
    for (let start = from; start <= options.today; start = addDays(start, stream.chunkDays)) {
      const end = minDate(addDays(start, stream.chunkDays - 1), options.today);
      const result = await run(start, end);
      if (result.refusedThrough) log(`  ${stream.name}: Garmin refused recent dates up to ${result.refusedThrough}`);
    }
    state.newest_date = options.today;
    saveState(db, stream.name, state);
  } else {
    // First run ever: the backfill starts at today and covers it.
    state = { newest_date: options.today, oldest_date: addDays(options.today, 1), backfill_done: 0, empty_streak: 0 };
  }

  // A floor older than what an earlier, completed backfill reached re-opens the backfill.
  if (state.backfill_done && options.exhaustive && state.oldest_date && options.floorDate < state.oldest_date) {
    state.backfill_done = 0;
    state.empty_streak = 0;
  }

  // Phase 2: backfill -------------------------------------------------------------------------
  let chunks = 0;
  while (!state.backfill_done && state.oldest_date) {
    if (options.maxBackfillChunks !== undefined && chunks >= options.maxBackfillChunks) {
      log(`  ${stream.name}: paused at ${state.oldest_date}, continues next run`);
      break;
    }

    const end = addDays(state.oldest_date, -1);
    if (end < options.floorDate) {
      state.backfill_done = 1;
      break;
    }
    const start = maxDate(addDays(end, -(stream.chunkDays - 1)), options.floorDate);

    const result = await run(start, end);
    chunks++;

    // Garmin refusing even single days means we've gone past the history it serves.
    if (result.refusedThrough) {
      state.oldest_date = addDays(result.refusedThrough, 1);
      state.backfill_done = 1;
      saveState(db, stream.name, state);
      log(`  ${stream.name}: Garmin refuses dates before ${state.oldest_date}, treating that as the start of history`);
      break;
    }

    state.oldest_date = start;
    state.empty_streak = result.stored > 0 ? 0 : state.empty_streak + 1;
    const exhaustedByStreak = !options.exhaustive && state.empty_streak >= stream.maxEmptyChunks;
    if (result.noOlderData || exhaustedByStreak || start <= options.floorDate) state.backfill_done = 1;
    saveState(db, stream.name, state);

    if (result.stored > 0) log(`  ${stream.name}: ${start} → ${end}: ${result.stored}`);
  }

  summary.oldest = state.oldest_date;
  summary.backfillDone = state.backfill_done === 1;
  return summary;
}

/**
 * On HTTP 400 (range too large, or dates Garmin won't serve) split the range in half and retry,
 * down to single days. A refused single day is reported through `refusedThrough` instead of thrown.
 */
async function syncAdaptive(
  stream: RangeStream,
  start: CalendarDate,
  end: CalendarDate,
  onRequest: () => void,
): Promise<RangeResult> {
  onRequest();
  try {
    return await stream.syncRange(start, end);
  } catch (error) {
    if (!(error instanceof GarminHttpError) || error.status !== 400) throw error;

    const days = daysBetween(start, end);
    if (days <= 1) return { stored: 0, refusedThrough: start };

    const firstEnd = addDays(start, Math.floor(days / 2) - 1);
    const older = await syncAdaptive(stream, start, firstEnd, onRequest);
    const newer = await syncAdaptive(stream, addDays(firstEnd, 1), end, onRequest);
    const refusedThrough = newer.refusedThrough ?? older.refusedThrough;
    return { stored: older.stored + newer.stored, noOlderData: older.noOlderData, refusedThrough };
  }
}

function loadState(db: Database, stream: string): StreamState {
  const row = db.prepare('SELECT newest_date, oldest_date, backfill_done, empty_streak FROM sync_state WHERE stream = ?').get(stream);
  return row
    ? {
        newest_date: (row.newest_date as string | null) ?? null,
        oldest_date: (row.oldest_date as string | null) ?? null,
        backfill_done: Number(row.backfill_done),
        empty_streak: Number(row.empty_streak),
      }
    : { newest_date: null, oldest_date: null, backfill_done: 0, empty_streak: 0 };
}

function saveState(db: Database, stream: string, state: StreamState): void {
  db.prepare(
    `INSERT INTO sync_state (stream, newest_date, oldest_date, backfill_done, empty_streak, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (stream) DO UPDATE SET
       newest_date = excluded.newest_date, oldest_date = excluded.oldest_date,
       backfill_done = excluded.backfill_done, empty_streak = excluded.empty_streak, updated_at = excluded.updated_at`,
  ).run(stream, state.newest_date, state.oldest_date, state.backfill_done, state.empty_streak, Date.now());
}
