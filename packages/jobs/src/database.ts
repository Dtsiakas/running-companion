import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '@companion/db';
import { computeMetrics } from '@companion/metrics';

/** Applies pending migrations and computes metrics if they never were, so readers can go read-only afterwards. */
export function prepareDatabase(dbFile: string): void {
  const db = openDatabase(dbFile);
  try {
    if (!db.prepare('SELECT 1 FROM daily_metrics LIMIT 1').get()) computeMetrics(db);
  } finally {
    db.close();
  }
}

/**
 * A connection that cannot write. Used for everything that only reads (dashboard API, MCP tools),
 * so a bug or a mistaken query can't change data. In WAL mode it sees new data as soon as a sync commits.
 */
export function openReadOnly(dbFile: string): DatabaseSync {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}
