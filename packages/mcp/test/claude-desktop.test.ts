import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { claudeDesktopLocations } from '../src/claude-desktop.ts';

function windowsHome(layout: (paths: { roaming: string; local: string }) => void) {
  const home = mkdtempSync(join(tmpdir(), 'claude-desktop-'));
  const roaming = join(home, 'AppData', 'Roaming');
  const local = join(home, 'AppData', 'Local');
  mkdirSync(roaming, { recursive: true });
  mkdirSync(local, { recursive: true });
  layout({ roaming, local });
  return { home, roaming, local, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function file(path: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '{}');
}

test('current Microsoft Store layout: config in Claude-Data, logs in Local\\Claude\\Logs', () => {
  const env = windowsHome(({ local }) => {
    file(join(local, 'Claude-Data', 'claude_pzs8sxrjxfjjc', 'claude_desktop_config.json'));
    file(join(local, 'Claude', 'Logs', 'main.log'));
    mkdirSync(join(local, 'Packages', 'Claude_pzs8sxrjxfjjc'), { recursive: true });
  });
  const locations = claudeDesktopLocations({ platform: 'win32', home: env.home, appData: env.roaming, localAppData: env.local });
  assert.deepEqual(locations.configFiles, [join(env.local, 'Claude-Data', 'claude_pzs8sxrjxfjjc', 'claude_desktop_config.json')]);
  assert.deepEqual(locations.logFolders, [join(env.local, 'Claude', 'Logs')]);
  env.cleanup();
});

test('standard installer layout, and where a first config is created', () => {
  const env = windowsHome(() => {});
  const empty = claudeDesktopLocations({ platform: 'win32', home: env.home, appData: env.roaming, localAppData: env.local });
  assert.deepEqual(empty.configFiles, []);
  assert.equal(empty.defaultConfigFile, join(env.roaming, 'Claude', 'claude_desktop_config.json'));

  file(join(env.roaming, 'Claude', 'claude_desktop_config.json'));
  file(join(env.roaming, 'Claude', 'logs', 'main.log'));
  const standard = claudeDesktopLocations({ platform: 'win32', home: env.home, appData: env.roaming, localAppData: env.local });
  assert.deepEqual(standard.configFiles, [join(env.roaming, 'Claude', 'claude_desktop_config.json')]);
  assert.deepEqual(standard.logFolders, [join(env.roaming, 'Claude', 'logs')]);
  env.cleanup();
});

test('every existing config is reported, so the installer updates all of them', () => {
  const env = windowsHome(({ local }) => {
    file(join(local, 'Claude-Data', 'claude_abc', 'claude_desktop_config.json'));
    file(join(local, 'Packages', 'Claude_abc', 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    mkdirSync(join(local, 'Packages', 'Microsoft.Other_123'), { recursive: true });
  });
  const locations = claudeDesktopLocations({ platform: 'win32', home: env.home, appData: env.roaming, localAppData: env.local });
  assert.equal(locations.configFiles.length, 2);
  assert.equal(locations.defaultConfigFile, join(env.local, 'Claude-Data', 'claude_abc', 'claude_desktop_config.json'));
  env.cleanup();
});
