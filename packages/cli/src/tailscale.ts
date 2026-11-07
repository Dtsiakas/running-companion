/**
 * The few Tailscale commands the desktop app needs, through the `tailscale` command line tool.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Tailscale's installer puts tailscale.exe here; it is usually on PATH as well. */
const WINDOWS_PATH = 'C:\\Program Files\\Tailscale\\tailscale.exe';

export const TAILSCALE = existsSync(WINDOWS_PATH) ? WINDOWS_PATH : 'tailscale';

export interface TailscaleStatus {
  /** 'Running' when connected; 'Stopped' after `tailscale down`; 'NeedsLogin' when signed out. */
  BackendState: string;
  Self?: { DNSName?: string };
}

/** null when the Tailscale service isn't reachable at all (not installed, or the app isn't running). */
export function status(): TailscaleStatus | null {
  const result = spawnSync(TAILSCALE, ['status', '--json'], { encoding: 'utf8', stdio: 'pipe' });
  if (result.error) return null;
  // `status` exits non-zero while disconnected but still prints the JSON. Only stdout holds it: a warning on stderr
  // (a version mismatch between the app and its service, say) would make the whole text unreadable as JSON.
  const json = (result.stdout ?? '').slice((result.stdout ?? '').indexOf('{'));
  try {
    return JSON.parse(json) as TailscaleStatus;
  } catch {
    return null;
  }
}

/** Removes every Funnel and Serve rule, including ones made persistent with --bg. */
export function clearFunnel(): void {
  spawnSync(TAILSCALE, ['funnel', 'reset'], { stdio: 'ignore' });
}
