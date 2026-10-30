/**
 * Turns Running Companion off from any terminal, and cleans up whatever is left if the `npm run up` window was killed
 * without its own clean-up (Task Manager, a crash, a power cut). Safe to run when everything is already off.
 *
 *   npm run down
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '@companion/config';
import { clearFunnel, tailscale } from './tailscale.ts';

const PID_FILE = join(ROOT, 'data', 'up.pid');

if (existsSync(PID_FILE)) {
  const pids = JSON.parse(readFileSync(PID_FILE, 'utf8')) as { up?: number; server?: number; funnel?: number };
  for (const pid of [pids.up, pids.server, pids.funnel]) {
    try {
      if (pid) process.kill(pid);
    } catch {
      // Already gone.
    }
  }
  rmSync(PID_FILE, { force: true });
}
clearFunnel();
tailscale(['down']);
console.log('✓ Off: the server is stopped, the public address is closed and Tailscale is disconnected.');
