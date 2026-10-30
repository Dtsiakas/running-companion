/**
 * Computes derived metrics from the synced data. `npm run sync` already does this at the end;
 * run it on its own after changing a formula.
 *
 *   npm run metrics              new or outdated activities + all days
 *   npm run metrics -- --full    recompute everything
 */
import { parseArgs } from 'node:util';
import { openDatabase } from '@companion/db';
import { computeMetrics } from '@companion/metrics';
import { DB_FILE } from '@companion/config';

const { values: args } = parseArgs({ options: { full: { type: 'boolean', default: false } } });

const started = Date.now();
const db = openDatabase(DB_FILE);
try {
  const summary = computeMetrics(db, { full: args.full, log: (message) => console.log(message) });
  const { maxHr, lthr, lt1Hr, refHr } = summary.thresholds;
  console.log(`Metrics: ${summary.activities} activities, ${summary.days} days in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`Thresholds: max HR ${maxHr}, LTHR ${lthr}, LT1 ≈ ${lt1Hr}, reference HR ${refHr}`);
} finally {
  db.close();
}
