import { m } from '../../lib/i18n.ts';
import styles from './charts.module.css';

export interface Intensity {
  low: number | null;
  moderate: number | null;
  high: number | null;
}

const SEGMENTS = [
  { key: 'low', color: 'var(--intensity-low)' },
  { key: 'moderate', color: 'var(--intensity-moderate)' },
  { key: 'high', color: 'var(--intensity-high)' },
] as const;

/**
 * Share of running time per intensity zone, as one bar. Plain HTML: three proportional segments
 * don't need a charting library. A 2px gap separates segments; every share is also written out.
 */
export function IntensityBar({ intensity }: { intensity: Intensity | null }) {
  if (!intensity || intensity.low === null) return <p className={styles.muted}>{m.charts.intensity.noData}</p>;
  return (
    <figure className={styles.figure}>
      <div className={styles.stack} role="img" aria-label={SEGMENTS.map((s) => `${m.charts.intensity[s.key]} ${intensity[s.key]}%`).join(', ')}>
        {SEGMENTS.map((segment) =>
          (intensity[segment.key] ?? 0) > 0 ? (
            <span key={segment.key} style={{ flexGrow: intensity[segment.key] ?? 0, background: segment.color }} title={`${m.charts.intensity[segment.key]} ${intensity[segment.key]}%`} />
          ) : null,
        )}
      </div>
      <div className={styles.legend}>
        {SEGMENTS.map((segment) => (
          <span key={segment.key}>
            <i style={{ background: segment.color }} /> {m.charts.intensity[segment.key]} {intensity[segment.key] ?? 0}%
          </span>
        ))}
      </div>
    </figure>
  );
}
