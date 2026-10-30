import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '@companion/db';
import { GarminHttpError } from '@companion/garmin-client';
import { addDays, daysBetween, walkStream, type CalendarDate, type RangeStream } from '@companion/sync';

/** A fake stream with one item per day between `firstDay` and `lastDay`, recording every request. */
function fakeStream(options: { firstDay: CalendarDate; lastDay: CalendarDate; chunkDays?: number; maxDaysPerRequest?: number; refuseBefore?: CalendarDate }) {
  const requests: Array<[CalendarDate, CalendarDate]> = [];
  const stream: RangeStream = {
    name: 'fake',
    chunkDays: options.chunkDays ?? 10,
    maxEmptyChunks: 2,
    async syncRange(start, end) {
      requests.push([start, end]);
      if (options.refuseBefore && start < options.refuseBefore) throw new GarminHttpError(400, 'GET', '/fake', 'too old');
      if (options.maxDaysPerRequest && daysBetween(start, end) > options.maxDaysPerRequest) throw new GarminHttpError(400, 'GET', '/fake', 'range too big');
      let stored = 0;
      for (let day = start; day <= end; day = addDays(day, 1)) if (day >= options.firstDay && day <= options.lastDay) stored++;
      return { stored };
    },
  };
  return { stream, requests };
}

const base = { lookbackDays: 3, floorDate: '2000-01-01' };

test('first run backfills from today until the empty streak ends it', async () => {
  const db = openDatabase(':memory:');
  const { stream, requests } = fakeStream({ firstDay: '2026-09-15', lastDay: '2026-10-29' });

  const summary = await walkStream(db, stream, { ...base, today: '2026-10-29' });

  assert.equal(summary.stored, 45, 'every day from Sep 15 to Oct 29');
  assert.equal(summary.backfillDone, true);
  assert.deepEqual(requests[0], ['2026-10-20', '2026-10-29'], 'starts with the chunk ending today');
  // 10-day chunks: Oct 20–29, Oct 10–19, Sep 30–Oct 9, Sep 20–29, Sep 10–19 (has Sep 15–19),
  // then Aug 31–Sep 9 (empty, streak 1) and Aug 21–30 (empty, streak 2: stop).
  assert.equal(requests.length, 7);
});

test('later runs only fetch from (newest − lookback) to today', async () => {
  const db = openDatabase(':memory:');
  const { stream, requests } = fakeStream({ firstDay: '2026-09-15', lastDay: '2026-11-02' });
  await walkStream(db, stream, { ...base, today: '2026-10-29' });
  requests.length = 0;

  await walkStream(db, stream, { ...base, today: '2026-11-02' });
  assert.deepEqual(requests, [['2026-10-26', '2026-11-02']]);
});

test('an interrupted backfill resumes where it stopped', async () => {
  const db = openDatabase(':memory:');
  const { stream, requests } = fakeStream({ firstDay: '2026-06-01', lastDay: '2026-10-29' });

  const first = await walkStream(db, stream, { ...base, today: '2026-10-29', maxBackfillChunks: 2 });
  assert.equal(first.backfillDone, false);
  assert.equal(first.oldest, '2026-10-10');

  requests.length = 0;
  const second = await walkStream(db, stream, { ...base, today: '2026-10-29' });
  assert.equal(second.backfillDone, true);
  assert.deepEqual(requests[1], ['2026-09-30', '2026-10-09'], 'backfill continues right below the previous oldest date');
});

test('ranges Garmin refuses as too large are split in half', async () => {
  const db = openDatabase(':memory:');
  const { stream } = fakeStream({ firstDay: '2026-10-01', lastDay: '2026-10-29', maxDaysPerRequest: 3 });
  const summary = await walkStream(db, stream, { ...base, today: '2026-10-29' });
  assert.equal(summary.stored, 29);
});

test('Garmin refusing single old days ends the backfill instead of failing', async () => {
  const db = openDatabase(':memory:');
  const { stream } = fakeStream({ firstDay: '2020-01-01', lastDay: '2026-10-29', refuseBefore: '2026-10-15' });
  const summary = await walkStream(db, stream, { ...base, today: '2026-10-29' });
  assert.equal(summary.backfillDone, true);
  assert.equal(summary.oldest, '2026-10-15');
});

test('--since keeps going through empty months down to the floor', async () => {
  const db = openDatabase(':memory:');
  // Data, then a 3-month gap, then older data.
  const recent = fakeStream({ firstDay: '2026-10-01', lastDay: '2026-10-29' });
  await walkStream(db, recent.stream, { ...base, today: '2026-10-29', floorDate: '2026-06-01', exhaustive: true });
  assert.equal(recent.requests.at(-1)![0], '2026-06-01', 'reached the floor despite empty chunks');
});
