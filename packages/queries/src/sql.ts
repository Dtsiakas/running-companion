import type { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;

// Kept apart from queries.ts so Claude's query process (packages/jobs/src/query-process.ts) loads only this.

const MAX_ROWS = 200;

/**
 * Runs one read-only statement. The connection itself is read-only, so writes fail regardless;
 * the checks here only give clearer errors and keep results to a size that fits in a conversation.
 */
export function runQuery(db: DatabaseSync, sql: string) {
  const statement = sql.trim().replace(/;\s*$/, '');
  if (!/^(select|with)\b/i.test(statement)) return { error: 'Only SELECT (or WITH … SELECT) statements are allowed.' };
  if (statement.includes(';')) return { error: 'One statement at a time.' };
  if (/\battach\b/i.test(statement)) return { error: 'ATTACH is not allowed.' };

  const rows: Row[] = [];
  let truncated = false;
  for (const row of db.prepare(statement).iterate() as Iterable<Row>) {
    if (rows.length === MAX_ROWS) {
      truncated = true;
      break;
    }
    rows.push({ ...row });
  }
  return { rows, row_count: rows.length, truncated: truncated ? `Stopped at ${MAX_ROWS} rows: aggregate or add LIMIT.` : false };
}
