/**
 * The Windows app: what the Running Companion shortcut runs after installing it (see deploy/windows/). One window:
 * while it's open the app is on, and closing it turns everything off again. Nothing keeps running in the background.
 *
 * - Data lives in the user's own app-data folder, so reinstalling or updating never touches it.
 * - The first start opens the setup page in the browser, setup code filled in; later starts open the dashboard.
 * - With Tailscale connected, it can also give the app a public HTTPS address (Funnel) for the phone and Claude on the
 *   web. It asks once; the answer is kept in desktop.json next to the data.
 *
 *   --set-password    sets a new login password instead of starting (the Start Menu has a shortcut for it)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { clearFunnel, status, TAILSCALE } from './tailscale.ts';

const PORT = Number(process.env.PORT ?? 8787);
const LOCAL = `http://localhost:${PORT}`;

const say = (text = '') => console.log(text);

/** The app's folder: the nearest folder above this file with Running Companion's package.json. */
function findRoot(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 8; i++) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      try {
        if ((JSON.parse(readFileSync(file, 'utf8')) as { name?: string }).name === 'running-companion') return dir;
      } catch {
        // Not ours; keep looking.
      }
    }
    dir = dirname(dir);
  }
  throw new Error(`Can't find Running Companion's files above ${import.meta.dirname}.`);
}

/** Where the data goes: %LOCALAPPDATA%\\Running Companion. */
const appHome = (): string => join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Running Companion');

interface Prefs {
  /** Use Tailscale Funnel for a public HTTPS address. Unset until asked. */
  publicAddress?: boolean;
}

const ROOT = findRoot();
// How the server (and every process it starts) finds the app's own packages: see resolve-packages.ts.
const RESOLVE_HOOK = pathToFileURL(join(import.meta.dirname, 'resolve-packages.ts')).href;
const HOME = appHome();
const DATA_DIR = process.env.COMPANION_DATA_DIR ?? join(HOME, 'data');
const PREFS_FILE = join(HOME, 'desktop.json');
mkdirSync(DATA_DIR, { recursive: true });

const readPrefs = (): Prefs => {
  try {
    return JSON.parse(readFileSync(PREFS_FILE, 'utf8')) as Prefs;
  } catch {
    return {};
  }
};
const savePrefs = (prefs: Prefs) => writeFileSync(PREFS_FILE, `${JSON.stringify(prefs, null, 2)}\n`);

/** Ends with a message, keeping the window open long enough to read it when there is someone to read it. */
async function finish(code: number, message?: string): Promise<never> {
  if (message) say(`\n${message}`);
  if (process.stdin.isTTY && code !== 0) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('\nPress Enter to close this window.');
    rl.close();
  }
  process.exit(code);
}

function openBrowser(url: string): void {
  if (process.env.COMPANION_NO_BROWSER) return;
  // No shell: the URL is passed as a single argument, never pasted into a command line.
  spawn('explorer.exe', [url], { stdio: 'ignore', detached: true }).on('error', () => say(`  Open ${url} in your browser.`)).unref();
}

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/healthz`, { signal: AbortSignal.timeout(2000) });
    return response.ok && 'version' in ((await response.json()) as object);
  } catch {
    return false;
  }
}

/** What every process of the app needs to find its files and this user's data. */
const appEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  // A file URL has no spaces ("Running Companion" becomes Running%20Companion), so it needs no quoting here.
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${RESOLVE_HOOK}`].filter(Boolean).join(' '),
  COMPANION_ROOT: ROOT,
  COMPANION_DATA_DIR: DATA_DIR,
});

// Forgot the password: the way back in, from this computer only. Works whether the app is on or not.
if (process.argv.includes('--set-password')) {
  process.stdout.write('\x1b]0;Running Companion: new password\x07');
  say('Running Companion: set a new password\n');
  const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(import.meta.dirname, '..', '..', 'server', 'src', 'set-password.ts')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: appEnv(),
  });
  // Keep the window open on success too, so the result can be read.
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('\nPress Enter to close this window.');
    rl.close();
  }
  process.exit(result.status ?? 1);
}

process.title = 'Running Companion';
process.stdout.write('\x1b]0;Running Companion\x07'); // the window's title
say('Running Companion\n');

// Already on in another window: show it instead of starting a second copy.
if (await healthy()) {
  say(`It's already on (in another window): opening ${LOCAL}`);
  openBrowser(LOCAL);
  setTimeout(() => process.exit(0), 3000);
  await new Promise(() => {});
}

// A public address, if Tailscale is there and the user wants one ---------------------------------------------------
const prefs = readPrefs();
const tailnet = status();
let askedNow = false;
const dnsName = tailnet?.BackendState === 'Running' ? tailnet.Self?.DNSName?.replace(/\.$/, '') : undefined;
if (dnsName && prefs.publicAddress === undefined && process.stdin.isTTY) {
  say('Tailscale is connected on this computer. Running Companion can use it for a private HTTPS address on the');
  say(`internet (https://${dnsName}), so you can open it on your phone and connect Claude on the web. It's only`);
  say('there while this window is open, and the app always asks for your password.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Turn it on? [y/N] ');
  rl.close();
  prefs.publicAddress = /^y/i.test(answer.trim());
  askedNow = true;
  savePrefs(prefs);
  say(`Saved. To change it later, edit "publicAddress" in ${PREFS_FILE}.\n`);
}
const publicUrl = prefs.publicAddress && dnsName ? `https://${dnsName}` : null;
// Say where Tailscale stands, so a missing phone address is never a mystery.
if (prefs.publicAddress && !dnsName) say(`Tailscale isn't connected, so this time the app is on this computer only. Open Tailscale and start Running Companion again to use it from your phone.\n`);
else if (prefs.publicAddress === false && dnsName && !askedNow) say(`Phone and Claude on the web: off (you chose this). To be asked again, delete ${PREFS_FILE} and start the app again.\n`);
else if (prefs.publicAddress === undefined && tailnet && !dnsName) say(`Tailscale is installed but not connected (${tailnet.BackendState}). Connect it and start the app again to use it from your phone too.\n`);

// The server -----------------------------------------------------------------------------------------------------------
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', join(import.meta.dirname, '..', '..', 'server', 'src', 'main.ts')], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: {
    ...appEnv(),
    PORT: String(PORT),
    HOST: '127.0.0.1',
    PUBLIC_URL: publicUrl ?? LOCAL,
    TRUST_PROXY: publicUrl ? 'true' : 'false',
    SYNC_ON_START: 'true',
  },
});

// Pass the server's log through, and pick the setup link out of it on a first start.
let setupLink = null as string | null; // set by the log listener below
let buffered = '';
server.stdout.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk);
  buffered += chunk.toString();
  const match = /(https?:\/\/\S+\/setup\?code=[0-9a-f]+)/.exec(buffered);
  if (match) setupLink = match[1]!;
  buffered = buffered.slice(-500);
});

let funnel: ChildProcess | null = null;
let stopping = false;

/** Turns everything off. Runs once: on closing the window, Ctrl+C, or when the server stops by itself. */
function stop(reason: string, code = 0): void {
  if (stopping) return;
  stopping = true;
  say(`\n${reason} Turning off…`);
  if (funnel) {
    funnel.kill();
    clearFunnel();
  }
  if (server.exitCode === null) server.kill('SIGINT');
  // Give the server a moment to close its database cleanly.
  setTimeout(() => void finish(code, code ? undefined : '✓ Off.'), 1500);
}

process.on('SIGINT', () => stop('Ctrl+C.'));
process.on('SIGTERM', () => stop('Stop requested.'));
// Windows sends SIGHUP when the window is closed, and ends the process a few seconds later: enough to clean up.
process.on('SIGHUP', () => stop('Window closed.'));
server.on('exit', (code) =>
  setTimeout(() => {
    if (!stopping) stop(`The server stopped${code ? ` (exit code ${code}); the lines above say why` : ''}.`, code || 1);
  }, 300),
);

for (let i = 0; i < 60 && !(await healthy()) && !stopping; i++) await new Promise((resolve) => setTimeout(resolve, 500));
if (stopping) await new Promise(() => {});
if (!(await healthy())) {
  stop("The server didn't start; the lines above say why.", 1);
  await new Promise(() => {});
}

if (publicUrl) {
  // Without --bg the Funnel belongs to this process: if this window goes, so does the public address.
  funnel = spawn(TAILSCALE, ['funnel', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  funnel.stdout?.on('data', (chunk: Buffer) => (output += chunk));
  funnel.stderr?.on('data', (chunk: Buffer) => (output += chunk));
  funnel.on('exit', () =>
    setTimeout(() => {
      if (stopping) return;
      funnel = null;
      say(`\nThe public address stopped, so the app is on this computer only now.\n${output.trim()}`);
      if (/funnel.*not (enabled|allowed)|nodeAttrs/i.test(output)) say('Funnel may need to be allowed for your tailnet, in the Tailscale admin console (Access controls).');
    }, 300),
  );
}

const address = publicUrl ?? LOCAL;
say('\n✓ Running Companion is on');
say(`    On this computer:  ${LOCAL}`);
if (publicUrl) say(`    Phone and Claude:  ${publicUrl}`);
say('  Keep this window open while you use it. Close it to turn Running Companion off.\n');
// The first start goes straight to setup, with its one-time code; after that, the dashboard.
openBrowser(setupLink ? setupLink.replace(/^https?:\/\/[^/]+/, address) : address);
