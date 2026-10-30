import { m } from '../lib/i18n.ts';
import styles from './Note.module.css';

/** "What is this?": a short explanation that stays out of the way until asked for. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <details className={styles.note}>
      <summary>{m.app.whatIsThis}</summary>
      <p>{children}</p>
    </details>
  );
}
