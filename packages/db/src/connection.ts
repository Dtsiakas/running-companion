import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrate.ts';

export type Database = DatabaseSync;

/**
 * Opens (or creates) the database file and brings the schema up to date.
 * Pass ':memory:' for a throwaway database in tests.
 */
export function openDatabase(file: string): Database {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  // WAL: readers (dashboard, MCP server) keep working while the sync writes.
  db.exec('PRAGMA journal_mode = WAL');
  // NORMAL is safe with WAL and much faster than FULL; at worst the last transaction is lost on power failure.
  db.exec('PRAGMA synchronous = NORMAL');
  // SQLite ships with foreign keys off for backwards compatibility.
  db.exec('PRAGMA foreign_keys = ON');
  // Wait up to 5s for a lock instead of failing immediately when another process is writing.
  db.exec('PRAGMA busy_timeout = 5000');

  migrate(db);
  return db;
}

/** Runs `work` in a transaction: all of its writes land, or none do. */
export function transaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
