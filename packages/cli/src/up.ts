/**
 * Turns Running Companion on, on this laptop: connects Tailscale, starts the server and opens the public HTTPS address.
 * Everything stays tied to this terminal window. Ctrl+C, or closing the window, turns all of it off again:
 * the server stops, the public address disappears and Tailscale disconnects. Nothing keeps running in the background.
 *
 *   npm run up
 *
 * If the window was killed in a way that skipped the clean-up (Task Manager, a crash), `npm run down` does it.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, ROOT } from '@companion/config';
import { clearFunnel, status, tailscale, TAILSCALE } from './tailscale.ts';

const PORT = 8787;
const ENV_FILE = join(ROOT, '.env');
const PID_FILE = join(ROOT, 'data', 'up.pid');
const npm = 'npm';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const say = (text: string) => console.log(`\n${text}`);
const fail = (text: string): never => {
  console.error(`\n✗ ${text}`);
  process.exit(1);
};

/**
 * Runs a command in the project folder with its output visible; true when it succeeded. No shell: git is a real
 * executable everywhere, and npm runs as `node npm-cli.js` (npm_execpath, set because `npm run up` started us), which
 * avoids Windows' npm.cmd, the one thing that needed a shell. Arguments are never pasted into a command line.
 */
function run(command: string, args: string[]): boolean {
  const npmScript = process.env.npm_execpath;
  if (command === 'npm' && npmScript?.endsWith('.js')) return spawnSync(process.execPath, [npmScript, ...args], { cwd: ROOT, stdio: 'inherit' }).status === 0;
  // Started some other way on Windows: npm.cmd needs a shell, so hand it one fixed command line (our own constant arguments).
  if (command === 'npm' && process.platform === 'win32') return spawnSync(`npm ${args.join(' ')}`, { cwd: ROOT, stdio: 'inherit', shell: true }).status === 0;
  return spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' }).status === 0;
}

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok;
  } catch {
    return false;
  }
}

if (await healthy()) fail('Running Companion is already on (in another window). Turn it off there, or run: npm run down');

// 1. Tailscale --------------------------------------------------------------------------------------------------------
// A Funnel left over from `tailscale funnel --bg` would publish the address even while the app is off: clear it.
clearFunnel();
let state = status();
if (!state) fail(`Tailscale isn't running. Open the Tailscale app, then run this again. (Looked for: ${TAILSCALE})`);
if (state!.BackendState !== 'Running') {
  say('Connecting Tailscale…');
  if (!tailscale(['up'], { inherit: true }).ok) fail('Tailscale could not connect. Click "Connect" in the Tailscale app, then run this again.');
  state = status();
}
const dnsName = state?.Self?.DNSName?.replace(/\.$/, '');
if (!dnsName) fail('Tailscale is connected but reports no address for this computer.');
const publicUrl = `https://${dnsName}`;

// The server must know its own public address for Claude's sign-in flow; keep .env in step with Tailscale.
const env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
const wanted = { PUBLIC_URL: publicUrl, TRUST_PROXY: 'true' };
let updated = env;
for (const [key, value] of Object.entries(wanted)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  updated = pattern.test(updated) ? updated.replace(pattern, () => line) : `${updated.replace(/\s*$/, '')}\n${line}\n`;
}
if (updated !== env) {
  writeFileSync(ENV_FILE, updated);
  say(`Updated .env: PUBLIC_URL=${publicUrl}, TRUST_PROXY=true`);
}

// 2. Latest version ---------------------------------------------------------------------------------------------------
// Pulls new commits from GitHub when it safely can: only fast-forwards, and only without local changes.
// package-lock.json is the exception: npm writes it, nobody edits it by hand, so a change there is restored rather than
// treated as your work (an older version of this script ran `npm install`, which could rewrite it).
const LOCKFILE = 'package-lock.json';
const git = (...args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
if (git('fetch', '--quiet').status === 0) {
  const behind = Number(git('rev-list', '--count', 'HEAD..@{u}').stdout.trim() || 0);
  let changed = git('status', '--porcelain', '--untracked-files=no').stdout.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
  if (behind > 0 && changed.length && changed.every((file) => file === LOCKFILE)) {
    git('checkout', '--', LOCKFILE);
    changed = [];
  }
  if (behind > 0 && !changed.length) {
    say(`Updating to the latest version (${behind} new commit${behind === 1 ? '' : 's'})…`);
    // Installing and building follow below: the lockfile and commit no longer match what was installed and built.
    if (!run('git', ['pull', '--ff-only', '--quiet'])) fail('The update failed (see above). Nothing was started.');
  } else if (behind > 0) {
    say(`There are ${behind} new commits on GitHub, but these files were changed on this computer, so this version stays: ${changed.join(', ')}. Undo the changes (git checkout -- <file>) or commit them to update.`);
  }
}
// The code can also change without this script pulling it (a `git pull` by hand, switching branches). Dependencies and
// the dashboard are checked against what's here now, not against whether this run updated anything.
const INSTALLED_FOR = join(ROOT, 'node_modules', '.companion-lockfile');
const BUILT_FOR = join(ROOT, 'packages', 'web', 'dist', '.companion-commit');
const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
const lockfile = read(join(ROOT, LOCKFILE));
if (read(INSTALLED_FOR) !== hash(lockfile)) {
  say('Installing dependencies…');
  // npm ci installs exactly what the lockfile says and never rewrites it, so this can't create local changes.
  if (!run(npm, ['ci', '--no-audit', '--no-fund', '--loglevel=error'])) fail('Installing dependencies failed (see above).');
  writeFileSync(INSTALLED_FOR, hash(lockfile));
}
const commit = git('rev-parse', 'HEAD').stdout.trim();
if (!existsSync(join(ROOT, 'packages', 'web', 'dist', 'index.html')) || (commit && read(BUILT_FOR) !== commit)) {
  say('Building the dashboard…');
  if (!run(npm, ['run', '--silent', 'build'])) fail('The build failed (see above).');
  if (commit) writeFileSync(BUILT_FOR, commit);
}

// 3. Server and public address ------------------------------------------------------------------------------------------
loadEnv();
say('Starting the server…');
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join('packages', 'server', 'src', 'main.ts')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, SYNC_ON_START: 'true' },
});

let funnel: ChildProcess | null = null;
let stopping = false;

/** Turns everything off. Runs once, on Ctrl+C, on closing the window, or when the server or Funnel stops by itself. */
function stop(reason: string): void {
  if (stopping) return;
  stopping = true;
  say(`${reason} Turning off…`);
  funnel?.kill();
  clearFunnel();
  if (server.exitCode === null) server.kill('SIGINT');
  tailscale(['down']);
  rmSync(PID_FILE, { force: true });
  console.log('✓ Off: the server is stopped, the public address is closed and Tailscale is disconnected.');
  // Give the server a moment to close its database cleanly, then leave.
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => stop('Ctrl+C.'));
process.on('SIGTERM', () => stop('Stop requested.'));
// Windows sends SIGHUP when the window is closed and ends the process about 10 seconds later: enough to clean up.
process.on('SIGHUP', () => stop('Window closed.'));
// Ctrl+C reaches the server and Funnel at the same moment as this process, so their exits are only treated as
// unexpected if this process hasn't started stopping shortly after.
const unexpected = (reason: string) => setTimeout(() => stop(reason), 300);
server.on('exit', (code) => unexpected(`The server stopped${code ? ` (exit code ${code})` : ''}.`));

for (let i = 0; i < 30 && !(await healthy()); i++) await new Promise((resolve) => setTimeout(resolve, 1000));
if (!(await healthy())) stop('The server did not start.');

// Without --bg the Funnel belongs to this process: if this window disappears, so does the public address.
funnel = spawn(TAILSCALE, ['funnel', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let funnelOutput = '';
funnel.stdout?.on('data', (chunk: Buffer) => (funnelOutput += chunk));
funnel.stderr?.on('data', (chunk: Buffer) => (funnelOutput += chunk));
funnel.on('exit', () =>
  setTimeout(() => {
    if (stopping) return;
    console.error(funnelOutput.trim());
    stop('The public address stopped.');
  }, 300),
);

writeFileSync(PID_FILE, JSON.stringify({ up: process.pid, server: server.pid, funnel: funnel.pid }));
say(`✓ Running Companion is on: ${publicUrl}
  It syncs with Garmin now and at the scheduled hours while it's on.
  To turn everything off: press Ctrl+C here, or close this window.`);
