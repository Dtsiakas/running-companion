import { fork } from 'node:child_process';

export const QUERY_TIMEOUT_MS = 15_000;

/**
 * Runs a query from Claude's `query` tool in a separate process with a time limit.
 *
 * node:sqlite is synchronous: on the server's own thread, a heavy query (a join over the per-second records, say)
 * would freeze the dashboard, the API and every other Claude request until it finished. A worker thread isn't enough:
 * it can't be stopped while SQLite is busy, so a runaway query would burn a core until the server restarts. A process
 * can always be killed. Starting one costs a few tens of milliseconds, nothing next to a conversation's pace.
 * The process opens its own read-only connection, so nothing it runs can write.
 */
export function runQueryIsolated(dbFile: string, sql: string, timeoutMs = QUERY_TIMEOUT_MS): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = fork(new URL('./query-process.ts', import.meta.url), { execArgv: ['--disable-warning=ExperimentalWarning'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      settle(() => resolve({ error: `The query took longer than ${timeoutMs / 1000}s and was stopped. Narrow it: filter by date, aggregate, or avoid activity_records unless you need per-second data.` }));
    }, timeoutMs);
    child.once('message', (message: { ok: true; result: unknown } | { ok: false; message: string }) =>
      settle(() => (message.ok ? resolve(message.result) : reject(new Error(message.message)))),
    );
    child.once('error', (error) => settle(() => reject(error)));
    child.once('exit', (code, signal) => settle(() => reject(new Error(`The query process ended unexpectedly (${signal ?? code}).`))));
    child.send({ dbFile, sql });
  });
}
