import { Link } from 'react-router';
import { useSettings } from '../api/hooks.ts';
import { keySentence } from '../lib/garminKey.ts';
import { m } from '../lib/i18n.ts';
import styles from './KeyNotice.module.css';

/**
 * A dead key doesn't break anything visibly: the data just stops getting newer. So when the key needs attention,
 * Today says so at the top, with the fix one tap away. Nothing shows while it's fine.
 */
export function KeyNotice() {
  const { data } = useSettings();
  const state = data?.garmin.state;
  if (!data || data.demo || !state || state === 'ok') return null;
  const { garmin, locked } = data;
  return (
    <aside className={styles.notice} data-tone={garmin.state === 'expiring' ? 'warn' : 'bad'} aria-label={m.settings.notice.label}>
      <p className={styles.title}>{m.settings.notice[state]}</p>
      <p className={styles.text}>{keySentence(garmin, locked.garminKey ? m.settings.where.onServer : m.settings.where.inSettings)}</p>
      {locked.garminKey ? null : (
        <Link className={styles.action} to="/settings">
          {m.settings.notice.open}
        </Link>
      )}
    </aside>
  );
}
