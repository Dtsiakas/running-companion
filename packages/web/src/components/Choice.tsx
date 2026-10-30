import { useId } from 'react';
import styles from './Appearance.module.css';

/** A segmented choice (a radio group): works with the keyboard and screen readers as one control. */
export function Choice<T extends string>({ legend, options, value, onChange, showLegend = true }: { legend: string; options: Array<[T, string]>; value: T; onChange: (value: T) => void; showLegend?: boolean }) {
  const name = useId();
  return (
    <fieldset className={styles.appearance}>
      <legend className={showLegend ? undefined : styles.hidden}>{legend}</legend>
      <div className={styles.options} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map(([option, label]) => (
          <label key={option} className={styles.option}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
