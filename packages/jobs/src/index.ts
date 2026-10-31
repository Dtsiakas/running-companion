/** Operations shared by the CLI, the MCP stdio server and the web server. */
export { openReadOnly, prepareDatabase } from './database.ts';
export { isSyncRunning, syncNow, type SyncJobResult } from './sync-job.ts';
export { automaticBackup, backupFileName, readBackup, restoreBackup, writeBackup, writeBackupFile, type Backup, type BackupSummary, type DataPaths, type Manifest } from './backup.ts';
