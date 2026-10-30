/**
 * Runs a job at fixed local hours (e.g. 06:00, 08:00, … 22:00).
 *
 * In-process rather than an OS scheduler (cron, systemd timer): one process to deploy, and it shares the server's
 * single-flight sync, so a scheduled run and a manual one can't overlap. Local time follows the process time zone
 * (TZ=Europe/Athens on the server), so 06:00 stays 06:00 across daylight-saving changes.
 */
export function nextRunAfter(now: Date, hours: number[]): Date {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const hour of sorted) {
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0, 0);
      if (candidate > now) return candidate;
    }
  }
  throw new Error('No sync hours configured');
}

export interface Scheduler {
  next(): Date;
  stop(): void;
}

export function startScheduler(options: { hours: number[]; run: () => Promise<unknown>; log: (message: string) => void }): Scheduler {
  let timer: NodeJS.Timeout | undefined;
  let next = nextRunAfter(new Date(), options.hours);

  const schedule = () => {
    next = nextRunAfter(new Date(), options.hours);
    // Timers longer than ~24.8 days overflow; ours are at most a day, but re-arming each run keeps them short anyway.
    timer = setTimeout(tick, Math.max(0, next.getTime() - Date.now()));
    timer.unref?.();
  };

  const tick = async () => {
    try {
      options.log('Scheduled sync starting');
      await options.run();
      options.log('Scheduled sync finished');
    } catch (error) {
      options.log(`Scheduled sync failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      schedule();
    }
  };

  schedule();
  return {
    next: () => next,
    stop: () => clearTimeout(timer),
  };
}
