import type { Signal } from '@companion/insights';
import styles from './Signals.module.css';

const LEVEL = {
  warning: { label: 'Act today', icon: '▲' },
  watch: { label: 'Keep an eye on', icon: '●' },
  positive: { label: 'Going well', icon: '✓' },
} as const;

/**
 * Today's signals as short cards, most urgent first. Each says what the data shows (with numbers) and, when there's
 * something to do, what. The level is written out and marked with a shape as well as a colour.
 */
export function Signals({ signals }: { signals: Signal[] }) {
  return (
    <ul className={styles.list}>
      {signals.map((signal) => (
        <li key={signal.id} className={styles.signal} data-level={signal.level}>
          <p className={styles.level}>
            <span aria-hidden="true">{LEVEL[signal.level].icon}</span> {LEVEL[signal.level].label}
          </p>
          <h3 className={styles.title}>{signal.title}</h3>
          <p className={styles.detail}>{signal.detail}</p>
          {signal.action ? <p className={styles.action}>{signal.action}</p> : null}
        </li>
      ))}
    </ul>
  );
}
