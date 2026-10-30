import type { Database } from '@companion/db';
import type { GarminApi } from '@companion/garmin-client';

export interface SyncContext {
  db: Database;
  api: GarminApi;
  /** Folder holding companion.db and fit/. */
  dataDir: string;
  log: (message: string) => void;
}

/** Layer 1: keep every response exactly as received. */
export function saveRaw(db: Database, endpoint: string, key: string, body: unknown): void {
  db.prepare(
    `INSERT INTO raw_responses (endpoint, key, fetched_at, body) VALUES (?, ?, ?, ?)
     ON CONFLICT (endpoint, key) DO UPDATE SET fetched_at = excluded.fetched_at, body = excluded.body`,
  ).run(endpoint, key, Date.now(), JSON.stringify(body ?? null));
}
