/** Operations shared by the CLI, the MCP stdio server and the web server. */
export { openReadOnly, prepareDatabase } from './database.ts';
export { isSyncRunning, syncNow, type SyncJobResult } from './sync-job.ts';
