import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

/**
 * Applies every migrations/NNN_name.sql file not yet recorded in schema_migrations, in order.
 * Each file runs in its own transaction, so a failing migration leaves the schema unchanged.
 * Applied migrations must never be edited: add a new file instead.
 */
export function migrate(db: DatabaseSync, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => Number(row.version)),
  );

  const files = readdirSync(dir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    const version = Number.parseInt(file, 10);
    if (applied.has(version)) continue;

    const sql = readFileSync(join(dir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(version, file, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    newlyApplied.push(file);
  }
  return newlyApplied;
}
