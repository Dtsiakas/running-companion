import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '@companion/config';

/** Name of this server in Claude Desktop's config, and in its log file name (mcp-server-<name>.log). */
export const SERVER_NAME = 'running-companion';
/** Names this server had before, removed from the config on install. */
export const LEGACY_SERVER_NAMES = ['running-app'];
export const CONFIG_FILE_NAME = 'claude_desktop_config.json';

export interface ServerEntry {
  command: string;
  args: string[];
}

/**
 * How Claude Desktop should start the server. The real path of the Node binary running this script:
 * with nvm-windows that is the versioned install, not the C:\nvm4w shortcut, so Claude Desktop keeps
 * using Node 26 even after `nvm use` switches the default for other projects.
 */
export function serverEntry(): ServerEntry {
  return { command: realpathSync(process.execPath), args: [join(ROOT, 'packages', 'mcp', 'src', 'server.ts')] };
}

export interface ClaudeDesktopLocations {
  /** Config files that exist. */
  configFiles: string[];
  /** Where to create the config when none exists yet. */
  defaultConfigFile: string;
  /** Log folders that exist. */
  logFolders: string[];
}

export interface Environment {
  platform: NodeJS.Platform;
  home: string;
  appData?: string;
  localAppData?: string;
}

const currentEnvironment = (): Environment => ({
  platform: process.platform,
  home: homedir(),
  appData: process.env.APPDATA,
  localAppData: process.env.LOCALAPPDATA,
});

/**
 * Where Claude Desktop keeps its config and logs. Windows has had three layouts:
 *  - standard installer:                %APPDATA%\Claude\  (config and logs\)
 *  - Microsoft Store, older builds:     %LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\
 *  - Microsoft Store, current builds:   config in %LOCALAPPDATA%\Claude-Data\claude_<id>\, logs in %LOCALAPPDATA%\Claude\Logs\
 * Which one a given install uses isn't visible from outside the app, so every location that exists is reported.
 */
export function claudeDesktopLocations(environment: Environment = currentEnvironment()): ClaudeDesktopLocations {
  const { platform, home } = environment;
  if (platform === 'darwin') {
    const file = join(home, 'Library', 'Application Support', 'Claude', CONFIG_FILE_NAME);
    return { configFiles: existing([file]), defaultConfigFile: file, logFolders: existing([join(home, 'Library', 'Logs', 'Claude')]) };
  }
  if (platform !== 'win32') {
    const folder = join(home, '.config', 'Claude');
    return { configFiles: existing([join(folder, CONFIG_FILE_NAME)]), defaultConfigFile: join(folder, CONFIG_FILE_NAME), logFolders: existing([join(folder, 'logs')]) };
  }

  const roaming = environment.appData ?? join(home, 'AppData', 'Roaming');
  const local = environment.localAppData ?? join(home, 'AppData', 'Local');
  const storeDataFolders = subfolders(join(local, 'Claude-Data'));
  const storePackageFolders = subfolders(join(local, 'Packages'))
    .filter((folder) => /[\\/]Claude_[^\\/]+$/.test(folder))
    .map((folder) => join(folder, 'LocalCache', 'Roaming', 'Claude'));
  const appFolders = [join(roaming, 'Claude'), ...storeDataFolders, ...storePackageFolders];

  // When nothing exists yet, prefer the current Store layout if it's present, else the standard one.
  const defaultFolder = storeDataFolders[0] ?? join(roaming, 'Claude');
  return {
    configFiles: existing(appFolders.map((folder) => join(folder, CONFIG_FILE_NAME))),
    defaultConfigFile: join(defaultFolder, CONFIG_FILE_NAME),
    logFolders: existing([join(local, 'Claude', 'Logs'), ...appFolders.map((folder) => join(folder, 'logs'))]),
  };
}

function existing(paths: string[]): string[] {
  return [...new Set(paths)].filter((path) => existsSync(path));
}

function subfolders(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map((name) => join(folder, name))
    .filter((path) => statSync(path).isDirectory());
}
