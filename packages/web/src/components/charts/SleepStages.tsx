import { hoursMinutes } from '../../lib/dates.ts';
import styles from './charts.module.css';

export interface Stages {
  deep: number | null;
  light: number | null;
  rem: number | null;
  awake: number | null;
}

/**
 * How the night divided into stages, as one bar ordered by depth. Deep, REM and light share the intensity ramp
 * (deep is the strongest step: darkest in light mode, brightest in dark mode); awake is neutral grey, because it isn't
 * a kind of sleep. Every stage is also written out with its time.
 */
const SEGMENTS = [
  { key: 'deep', label: 'Deep', color: 'var(--intensity-high)' },
  { key: 'rem', label: 'REM', color: 'var(--intensity-moderate)' },
  { key: 'light', label: 'Light', color: 'var(--intensity-low)' },
  { key: 'awake', label: 'Awake', color: 'var(--ink-3)' },
] as const;

export function SleepStages({ stages }: { stages: Stages }) {
  const total = SEGMENTS.reduce((sum, s) => sum + (stages[s.key] ?? 0), 0);
  if (!total) return null;
  return (
    <figure className={styles.figure}>
      <div className={styles.stack} role="img" aria-label={SEGMENTS.map((s) => `${s.label} ${hoursMinutes(stages[s.key])}`).join(', ')}>
        {SEGMENTS.map((s) =>
          (stages[s.key] ?? 0) > 0 ? <span key={s.key} style={{ flexGrow: stages[s.key] ?? 0, background: s.color }} title={`${s.label} ${hoursMinutes(stages[s.key])}`} /> : null,
        )}
      </div>
      <div className={styles.legend}>
        {SEGMENTS.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} /> {s.label} {hoursMinutes(stages[s.key])}
          </span>
        ))}
      </div>
    </figure>
  );
}
