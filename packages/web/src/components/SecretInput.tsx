import { useState, type InputHTMLAttributes } from 'react';
import { m } from '../lib/i18n.ts';
import styles from './SecretInput.module.css';

/**
 * A password or key field with a button that shows what was typed: easier to check a long passphrase or a pasted key.
 * Hidden again when the form is submitted and the page re-renders the field empty.
 */
export function SecretInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className={styles.field}>
      <input {...props} className={[styles.input, props.className].filter(Boolean).join(' ')} type={shown ? 'text' : 'password'} />
      <button type="button" className={styles.reveal} aria-pressed={shown} aria-label={shown ? m.app.reveal.hideLabel : m.app.reveal.showLabel} onClick={() => setShown((value) => !value)}>
        {shown ? m.app.reveal.hide : m.app.reveal.show}
      </button>
    </span>
  );
}
