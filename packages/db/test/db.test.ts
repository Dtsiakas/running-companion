import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { migrate, openDatabase, transaction, update, upsert } from '@companion/db';

test('migrations apply once and record themselves', () => {
  const db = openDatabase(':memory:');
  assert.deepEqual(migrate(db), [], 'second run applies nothing');
  const versions = db.prepare('SELECT version FROM schema_migrations').all();
  const files = readdirSync(join(import.meta.dirname, '..', 'migrations')).filter((file) => file.endsWith('.sql'));
  assert.equal(versions.length, files.length);
});

test('STRICT tables reject values of the wrong type', () => {
  const db = openDatabase(':memory:');
  assert.throws(() => db.prepare("INSERT INTO hrv (calendar_date, last_night_avg_ms, updated_at) VALUES ('2026-01-01', 'high', 0)").run());
});

test('upsert inserts, then updates only the columns given', () => {
  const db = openDatabase(':memory:');
  upsert(db, 'hrv', ['calendar_date'], { calendar_date: '2026-01-01', last_night_avg_ms: 70, status: 'BALANCED', updated_at: 1 });
  upsert(db, 'hrv', ['calendar_date'], { calendar_date: '2026-01-01', last_night_avg_ms: 75, updated_at: 2 });

  const row = db.prepare('SELECT * FROM hrv').get()!;
  assert.equal(row.last_night_avg_ms, 75);
  assert.equal(row.status, 'BALANCED', 'columns not passed are kept');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hrv').get()!.n, 1);
});

test('update changes an existing row and reports missing ones', () => {
  const db = openDatabase(':memory:');
  upsert(db, 'hrv', ['calendar_date'], { calendar_date: '2026-01-01', status: 'LOW', updated_at: 1 });
  assert.equal(update(db, 'hrv', ['calendar_date'], { calendar_date: '2026-01-01', status: 'BALANCED' }), 1);
  assert.equal(update(db, 'hrv', ['calendar_date'], { calendar_date: '2030-01-01', status: 'BALANCED' }), 0);
});

test('transaction rolls back every write when one fails', () => {
  const db = openDatabase(':memory:');
  assert.throws(() =>
    transaction(db, () => {
      upsert(db, 'hrv', ['calendar_date'], { calendar_date: '2026-01-01', updated_at: 1 });
      throw new Error('boom');
    }),
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hrv').get()!.n, 0);
});
