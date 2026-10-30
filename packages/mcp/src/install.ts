/**
 * Registers the MCP server with Claude Desktop by adding it to claude_desktop_config.json.
 * Updates every existing config file (see claude-desktop.ts for why there can be several), or creates one.
 * Existing servers and settings are kept; each previous file is backed up next to it.
 *
 *   npm run mcp:install             write the config
 *   npm run mcp:install -- --print  only print the entry
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { claudeDesktopLocations, LEGACY_SERVER_NAMES, SERVER_NAME, serverEntry } from './claude-desktop.ts';

const { values: args } = parseArgs({ options: { print: { type: 'boolean', default: false } } });
const entry = serverEntry();

if (args.print) {
  console.log(JSON.stringify({ mcpServers: { [SERVER_NAME]: entry } }, null, 2));
  process.exit(0);
}

const locations = claudeDesktopLocations();
const targets = locations.configFiles.length ? locations.configFiles : [locations.defaultConfigFile];

let failures = 0;
for (const configFile of targets) {
  let config: { mcpServers?: Record<string, unknown> } & Record<string, unknown> = {};
  const existed = existsSync(configFile);

  if (existed) {
    try {
      config = JSON.parse(readFileSync(configFile, 'utf8'));
    } catch {
      console.error(`✗ ${configFile} is not valid JSON: skipped. Fix or remove it, then run this again.`);
      failures++;
      continue;
    }
    copyFileSync(configFile, `${configFile}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  }

  const servers = { ...config.mcpServers };
  for (const legacy of LEGACY_SERVER_NAMES) {
    if (legacy in servers) console.log(`  removed the old "${legacy}" entry`);
    delete servers[legacy];
  }
  config.mcpServers = { ...servers, [SERVER_NAME]: entry };
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`✓ ${existed ? 'Updated' : 'Created'} ${configFile}`);
}

console.log(`\n  command: ${entry.command}\n  args:    ${entry.args[0]}`);
console.log('\nFully quit Claude Desktop (system tray → Quit, then check Task Manager) and start it again.');
console.log('Then check it with: npm run mcp:doctor');
process.exitCode = failures ? 1 : 0;
