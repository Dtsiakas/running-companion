/**
 * Local MCP server for Claude Desktop: Claude Desktop starts this file as a child process and talks to it
 * over stdin/stdout, so nothing may ever be printed to stdout except protocol messages (use stderr).
 * The same tools are served over HTTP by packages/server.
 *
 *   npm run mcp:install    registers it with Claude Desktop
 */
import { DB_FILE, loadEnv } from '@companion/config';
import { openDatabase } from '@companion/db';
import { openReadOnly, prepareDatabase, syncNow } from '@companion/jobs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './tools.ts';

loadEnv();
prepareDatabase(DB_FILE);
const db = openReadOnly(DB_FILE);
// Only the forecast cache writes; everything else reads.
const writeDb = openDatabase(DB_FILE);
const server = createMcpServer({ db, writeDb, sync: () => syncNow(DB_FILE) });

// Release the database file when Claude Desktop disconnects (Windows can't delete or replace an open file).
server.server.onclose = () => {
  if (db.isOpen) db.close();
  if (writeDb.isOpen) writeDb.close();
};

await server.connect(new StdioServerTransport());
console.error('running-companion MCP server ready');
