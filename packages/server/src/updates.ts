/**
 * The optional "a new version is out" notice in Settings. Off unless the user turns it on: when on, the server asks
 * GitHub for the newest release's version number once a day. Nothing about the user or their data goes with it, only
 * a User-Agent naming the app and its version, which GitHub's API requires.
 */

export const RELEASES_URL = 'https://api.github.com/repos/Dtsiakas/running-companion/releases/latest';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpdateState {
  /** The newest release's version, e.g. "0.3.1"; null until a check succeeded. */
  latest: string | null;
  /** Its release page. */
  url: string | null;
  /** When the last check finished (ISO), successful or not. */
  checkedAt: string | null;
  /** Why the last check failed, if it did. */
  error: string | null;
}

/** Compares "1.2.3"-style versions: negative, zero or positive, like a sort comparator. Pre-release tags count as lower. */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const [core = '', pre] = version.replace(/^v/, '').split('-', 2);
    return { parts: core.split('.').map((part) => Number.parseInt(part, 10) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const difference = (x.parts[i] ?? 0) - (y.parts[i] ?? 0);
    if (difference) return difference;
  }
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  return 0;
}

export interface UpdateChecker {
  /** Asks GitHub now (when enabled). Never throws: a failure is kept in the state. */
  check(): Promise<void>;
  state(): UpdateState;
  /** True when a newer release than this one is known. */
  available(): boolean;
  /** Checks now and then once a day, while enabled. Returns a function that stops it. */
  start(): () => void;
}

export function updateChecker(options: { enabled: () => boolean; current: string; fetch?: typeof fetch; now?: () => Date }): UpdateChecker {
  const fetchFn = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  let state: UpdateState = { latest: null, url: null, checkedAt: null, error: null };

  const check = async () => {
    if (!options.enabled()) return;
    try {
      const response = await fetchFn(RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `running-companion/${options.current}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const release = (await response.json()) as { tag_name?: string; html_url?: string };
      if (!release.tag_name) throw new Error('GitHub sent no version');
      state = { latest: release.tag_name.replace(/^v/, ''), url: release.html_url ?? null, checkedAt: now().toISOString(), error: null };
    } catch (error) {
      state = { ...state, checkedAt: now().toISOString(), error: error instanceof Error ? error.message : String(error) };
    }
  };

  return {
    check,
    state: () => state,
    available: () => state.latest !== null && compareVersions(state.latest, options.current) > 0,
    start() {
      void check();
      const timer = setInterval(() => void check(), DAY_MS);
      timer.unref();
      return () => clearInterval(timer);
    },
  };
}
