import { useId } from 'react';
import { setThemeChoice, useThemeChoice, type ThemeChoice } from '../lib/theme.ts';
import styles from './Appearance.module.css';

const OPTIONS: Array<[ThemeChoice, string]> = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** Light, dark, or follow the device. A radio group, so it works with the keyboard and screen readers as one choice. */
/** `showLegend={false}` where a heading above already says "Appearance" (the legend stays for screen readers). */
export function Appearance({ showLegend = true }: { showLegend?: boolean }) {
  const choice = useThemeChoice();
  // Its own radio-group name: the header menu and the More sheet both hold one, and same-named radios would act as one group.
  const name = useId();
  return (
    <fieldset className={styles.appearance}>
      <legend className={showLegend ? undefined : styles.hidden}>Appearance</legend>
      <div className={styles.options}>
        {OPTIONS.map(([value, label]) => (
          <label key={value} className={styles.option}>
            <input type="radio" name={name} value={value} checked={choice === value} onChange={() => setThemeChoice(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
