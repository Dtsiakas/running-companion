import styles from './charts.module.css';

export interface Intensity {
  low: number | null;
  moderate: number | null;
  high: number | null;
}

const SEGMENTS = [
  { key: 'low', label: 'Easy', color: 'var(--intensity-low)' },
  { key: 'moderate', label: 'Moderate', color: 'var(--intensity-moderate)' },
  { key: 'high', label: 'Hard', color: 'var(--intensity-high)' },
] as const;

/**
 * Share of running time per intensity zone, as one bar. Plain HTML: three proportional segments
 * don't need a charting library. A 2px gap separates segments; every share is also written out.
 */
export function IntensityBar({ intensity }: { intensity: Intensity | null }) {
  if (!intensity || intensity.low === null) return <p className={styles.muted}>No heart-rate data for this period.</p>;
  return (
    <figure className={styles.figure}>
      <div className={styles.stack} role="img" aria-label={SEGMENTS.map((s) => `${s.label} ${intensity[s.key]}%`).join(', ')}>
        {SEGMENTS.map((segment) =>
          (intensity[segment.key] ?? 0) > 0 ? (
            <span key={segment.key} style={{ flexGrow: intensity[segment.key] ?? 0, background: segment.color }} title={`${segment.label} ${intensity[segment.key]}%`} />
          ) : null,
        )}
      </div>
      <div className={styles.legend}>
        {SEGMENTS.map((segment) => (
          <span key={segment.key}>
            <i style={{ background: segment.color }} /> {segment.label} {intensity[segment.key] ?? 0}%
          </span>
        ))}
      </div>
    </figure>
  );
}
