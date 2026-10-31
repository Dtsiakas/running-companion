/** Runs one SQL query from Claude's `query` tool in its own process (see query.ts). */
import { runQuery } from '@companion/queries/sql';
import { DatabaseSync } from 'node:sqlite';

process.once('message', (message: { dbFile: string; sql: string }) => {
  let reply: { ok: true; result: unknown } | { ok: false; message: string };
  try {
    const db = new DatabaseSync(message.dbFile, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 5000');
    try {
      reply = { ok: true, result: runQuery(db, message.sql) };
    } finally {
      db.close();
    }
  } catch (error) {
    reply = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  process.send!(reply, () => process.exit(0));
});
