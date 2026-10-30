import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';

/** A row to write. `undefined` and booleans are accepted and converted (SQLite has neither). */
export type Row = Record<string, SQLInputValue | boolean | undefined>;

const statementCache = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

/**
 * Insert-or-update by primary key: re-syncing the same day or activity replaces its row
 * instead of duplicating it, so every sync step is safe to repeat.
 *
 * Table and column names come from our own code, never from API data, so building the SQL from them is safe.
 * Values always go through bound parameters.
 */
export function upsert(db: DatabaseSync, table: string, keyColumns: readonly string[], row: Row): void {
  const columns = Object.keys(row);
  const signature = `${table}|${keyColumns.join(',')}|${columns.join(',')}`;

  let cache = statementCache.get(db);
  if (!cache) statementCache.set(db, (cache = new Map()));

  let statement = cache.get(signature);
  if (!statement) {
    const updates = columns.filter((column) => !keyColumns.includes(column)).map((column) => `${column} = excluded.${column}`);
    const sql =
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((column) => `:${column}`).join(', ')}) ` +
      `ON CONFLICT (${keyColumns.join(', ')}) ` +
      (updates.length ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING');
    statement = db.prepare(sql);
    cache.set(signature, statement);
  }

  statement.run(toParams(row));
}

/**
 * Updates some columns of an existing row. Used when a later step fills in fields of a row created earlier
 * (an upsert can't do this: its INSERT half would fail the NOT NULL checks for the columns we don't pass).
 * Returns the number of rows changed: 0 means the row doesn't exist.
 */
export function update(db: DatabaseSync, table: string, keyColumns: readonly string[], row: Row): number {
  const setColumns = Object.keys(row).filter((column) => !keyColumns.includes(column));
  const sql =
    `UPDATE ${table} SET ${setColumns.map((column) => `${column} = :${column}`).join(', ')} ` +
    `WHERE ${keyColumns.map((column) => `${column} = :${column}`).join(' AND ')}`;
  return Number(db.prepare(sql).run(toParams(row)).changes);
}

function toParams(row: Row): Record<string, SQLInputValue> {
  const params: Record<string, SQLInputValue> = {};
  for (const [column, value] of Object.entries(row)) {
    params[column] = value === undefined ? null : typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }
  return params;
}
