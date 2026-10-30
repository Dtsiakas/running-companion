/**
 * The few Tailscale commands `npm run up` and `npm run down` need, through the `tailscale` command line tool.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** On Windows the installer puts tailscale.exe here; it is usually on PATH as well. */
const WINDOWS_PATH = 'C:\\Program Files\\Tailscale\\tailscale.exe';

export const TAILSCALE = process.platform === 'win32' && existsSync(WINDOWS_PATH) ? WINDOWS_PATH : 'tailscale';

export function tailscale(args: string[], options: { inherit?: boolean } = {}): { ok: boolean; output: string } {
  const result = spawnSync(TAILSCALE, args, { encoding: 'utf8', stdio: options.inherit ? 'inherit' : 'pipe' });
  if (result.error) return { ok: false, output: result.error.message };
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

export interface TailscaleStatus {
  /** 'Running' when connected; 'Stopped' after `tailscale down`; 'NeedsLogin' when signed out. */
  BackendState: string;
  Self?: { DNSName?: string };
}

/** null when the Tailscale service isn't reachable at all (not installed, or the app isn't running). */
export function status(): TailscaleStatus | null {
  const result = tailscale(['status', '--json']);
  // `status` exits non-zero while disconnected but still prints the JSON, so parse whatever came back.
  try {
    return JSON.parse(result.output.slice(result.output.indexOf('{'))) as TailscaleStatus;
  } catch {
    return null;
  }
}

/** Removes every Funnel and Serve rule, including ones made persistent with --bg. */
export function clearFunnel(): void {
  tailscale(['funnel', 'reset']);
}
