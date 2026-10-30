/**
 * Checks the MCP setup step by step, the way Claude Desktop uses it:
 * config files → server starts → tools respond → Claude Desktop's own logs.
 *
 *   npm run mcp:doctor
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { claudeDesktopLocations, SERVER_NAME, serverEntry, type ServerEntry } from './claude-desktop.ts';

let failed = false;
const ok = (message: string) => console.log(`✓ ${message}`);
const warn = (message: string) => console.log(`! ${message}`);
const fail = (message: string, hint?: string) => {
  failed = true;
  console.log(`✗ ${message}${hint ? `\n  → ${hint}` : ''}`);
};
const ago = (path: string) => {
  const minutes = Math.round((Date.now() - statSync(path).mtimeMs) / 60_000);
  return minutes < 60 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
};

const locations = claudeDesktopLocations();

// 1. Config files ---------------------------------------------------------------------------------------------
console.log('Config files (Claude Desktop rewrites its active one whenever settings change):');
let entry: ServerEntry | undefined;
if (!locations.configFiles.length) fail('No claude_desktop_config.json found', 'Run: npm run mcp:install');
for (const file of locations.configFiles) {
  try {
    const configured = JSON.parse(readFileSync(file, 'utf8')).mcpServers?.[SERVER_NAME] as ServerEntry | undefined;
    const age = `written ${ago(file)}`;
    if (configured) {
      ok(`${file} (${age}) has "${SERVER_NAME}"`);
      entry ??= configured;
    } else warn(`${file} (${age}) has no "${SERVER_NAME}" entry → run: npm run mcp:install`);
  } catch {
    fail(`${file} is not valid JSON`, 'Claude Desktop ignores every server when the file is invalid.');
  }
}

// 2. Logs: the active folder has a recent main.log -------------------------------------------------------------
console.log('\nLog folders:');
if (!locations.logFolders.length) warn('No Claude Desktop log folder found');
for (const folder of locations.logFolders) {
  const mainLog = join(folder, 'main.log');
  const mcpLogs = readdirSync(folder).filter((name) => name.startsWith('mcp'));
  console.log(`  ${folder}: main.log ${existsSync(mainLog) ? `written ${ago(mainLog)}` : 'missing'}; MCP logs: ${mcpLogs.join(', ') || 'none'}`);

  const ownLog = join(folder, `mcp-server-${SERVER_NAME}.log`);
  if (existsSync(ownLog)) {
    console.log(`  Last lines of mcp-server-${SERVER_NAME}.log (written ${ago(ownLog)}):`);
    for (const line of readFileSync(ownLog, 'utf8').trimEnd().split(/\r?\n/).slice(-15)) console.log(`    ${line}`);
  }
}
const started = locations.logFolders.some((folder) => existsSync(join(folder, `mcp-server-${SERVER_NAME}.log`)));
if (!started) warn(`Claude Desktop has not started "${SERVER_NAME}" yet (no mcp-server-${SERVER_NAME}.log)`);

// 3. Start the server exactly as Claude Desktop would and call a tool -----------------------------------------
console.log('');
entry ??= serverEntry();
if (!existsSync(entry.command)) fail(`Node not found at ${entry.command}`, 'Node was moved or uninstalled. Run: npm run mcp:install');
else if (!entry.args[0] || !existsSync(entry.args[0])) fail(`Server file not found: ${entry.args[0]}`, 'The project folder moved. Run: npm run mcp:install');
else {
  const client = new Client({ name: 'mcp-doctor', version: '1' });
  const transport = new StdioClientTransport({ command: entry.command, args: entry.args, stderr: 'pipe' });
  let serverErrors = '';
  transport.stderr?.on('data', (chunk) => (serverErrors += String(chunk)));
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    ok(`Server starts and offers ${tools.length} tools`);
    const today = await client.callTool({ name: 'get_today', arguments: {} });
    const result = JSON.parse((today.content as Array<{ text: string }>)[0]!.text) as { date?: string; status?: string; error?: string };
    if (result.error) fail(`get_today answered with an error: ${result.error}`);
    else ok(`get_today works: ${result.date}, status ${result.status ?? 'none'}`);
  } catch (error) {
    fail(`The server failed to start or answer: ${error instanceof Error ? error.message : String(error)}`, serverErrors.trim() || undefined);
  } finally {
    await client.close().catch(() => {});
  }
}

console.log(
  failed
    ? '\nFix the ✗ above, then run this again.'
    : started
      ? `\nAll good. If a chat still has no access, use a regular chat (not a task/Cowork session) and check the tools menu lists "${SERVER_NAME}".`
      : '\nThe server works but Claude Desktop hasn\'t started it: fully quit Claude Desktop (tray → Quit, check Task Manager) and reopen it.',
);
process.exitCode = failed ? 1 : 0;
