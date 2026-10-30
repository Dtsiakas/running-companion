import type { Database } from '@companion/db';

export interface TableStats {
  table: string;
  rows: number;
  from: string | null;
  to: string | null;
}

const TABLES: Array<[table: string, dateColumn: string]> = [
  ['activities', 'calendar_date'],
  ['activity_laps', "date(start_time / 1000, 'unixepoch', 'localtime')"],
  ['activity_records', "date(time / 1000, 'unixepoch', 'localtime')"],
  ['daily_wellness', 'calendar_date'],
  ['sleep', 'calendar_date'],
  ['hrv', 'calendar_date'],
  ['weigh_ins', 'calendar_date'],
  ['profile_snapshots', 'calendar_date'],
  ['activity_metrics', "date(computed_at / 1000, 'unixepoch', 'localtime')"],
  ['daily_metrics', 'calendar_date'],
  ['raw_responses', "date(fetched_at / 1000, 'unixepoch', 'localtime')"],
];

export function tableStats(db: Database): TableStats[] {
  return TABLES.map(([table, dateColumn]) => {
    const row = db.prepare(`SELECT COUNT(*) AS n, MIN(${dateColumn}) AS first, MAX(${dateColumn}) AS last FROM ${table}`).get()!;
    return { table, rows: Number(row.n), from: (row.first as string | null) ?? null, to: (row.last as string | null) ?? null };
  });
}
