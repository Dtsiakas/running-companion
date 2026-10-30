import styles from './Lane.module.css';

export interface Band {
  low: number;
  typical: number;
  high: number;
}

export interface LaneProps {
  label: string;
  /** Today's value, formatted for reading ("97 ms"). */
  valueText: string;
  /** What the value means relative to the band ("9% above your normal"). */
  description: string;
  value: number | null | undefined;
  band: Band | null | undefined;
  /** Which side of the band is the concerning one: low HRV and low sleep, high resting HR. */
  concernWhen: 'below' | 'above';
  /**
   * Flags only beyond this value instead of beyond the band edge. For signals so steady that the band is narrower
   * than any meaningful change (overnight breathing rate: ±0.5 breaths), the band edge would flag ordinary nights.
   */
  concernBeyond?: number | null;
  /** An extra reference line, e.g. Garmin's sleep need. */
  target?: { value: number; label: string } | null;
  children?: React.ReactNode;
}

/**
 * A recovery metric drawn as a lane on a track: the shaded band is your normal range (last 60 days),
 * the tick is your typical value, the dot is today. Colour only marks "outside your band on the concerning side",
 * and the description line always says the same in words, so the meaning never depends on colour alone.
 */
export function Lane({ label, valueText, description, value, band, concernWhen, concernBeyond, target, children }: LaneProps) {
  const hasData = value !== null && value !== undefined && band;
  const limit = concernBeyond ?? (band ? (concernWhen === 'below' ? band.low : band.high) : null);
  const concern = hasData && limit !== null && (concernWhen === 'below' ? value < limit : value > limit);

  return (
    <div className={styles.lane}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{valueText}</span>
      </div>
      {hasData ? <Track value={value} band={band} target={target} concern={!!concern} /> : <div className={styles.empty} />}
      <p className={styles.description} data-concern={concern || undefined}>
        {concern ? <span aria-hidden="true">▲ </span> : null}
        {description}
      </p>
      {children}
    </div>
  );
}

function Track({ value, band, target, concern }: { value: number; band: Band; target?: LaneProps['target']; concern: boolean }) {
  // The visible range: the band plus room on each side, always including today and the target.
  const points = [band.low, band.high, value, ...(target ? [target.value] : [])];
  const spread = Math.max(band.high - band.low, 1e-6);
  const min = Math.min(...points) - spread * 0.6;
  const max = Math.max(...points) + spread * 0.6;
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;

  // Plain positioned elements rather than SVG: everything sits on one axis, and a dot stays round at any width.
  return (
    <div className={styles.track} role="img" aria-label={`Today ${value}; your normal range is ${band.low} to ${band.high}${target ? `; ${target.label} ${target.value}` : ''}`}>
      <span className={styles.trackLine} />
      <span className={styles.band} style={{ left: at(band.low), width: `calc(${at(band.high)} - ${at(band.low)})` }} />
      <span className={styles.typical} style={{ left: at(band.typical) }} />
      {target ? (
        <span className={styles.target} style={{ left: at(target.value) }}>
          <span className={styles.targetLabel}>{target.label}</span>
        </span>
      ) : null}
      <span className={styles.marker} data-concern={concern || undefined} style={{ left: at(value) }} />
    </div>
  );
}
