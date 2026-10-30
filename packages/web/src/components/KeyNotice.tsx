import { Link } from 'react-router';
import { useSettings } from '../api/hooks.ts';
import { keySentence } from '../lib/garminKey.ts';
import styles from './KeyNotice.module.css';

const TITLES = {
  missing: 'Add your Garmin key',
  rejected: 'Garmin refused your key',
  expired: 'Your Garmin key has expired',
  expiring: 'Your Garmin key expires soon',
} as const;

/**
 * A dead key doesn't break anything visibly: the data just stops getting newer. So when the key needs attention,
 * Today says so at the top, with the fix one tap away. Nothing shows while it's fine.
 */
export function KeyNotice() {
  const { data } = useSettings();
  const state = data?.garmin.state;
  if (!data || !state || state === 'ok') return null;
  const { garmin, locked } = data;
  return (
    <aside className={styles.notice} data-tone={garmin.state === 'expiring' ? 'warn' : 'bad'} aria-label="Garmin key">
      <p className={styles.title}>{TITLES[state]}</p>
      <p className={styles.text}>{keySentence(garmin, locked.garminKey ? 'on the server' : 'in Settings')}</p>
      {locked.garminKey ? null : (
        <Link className={styles.action} to="/settings">
          Open Settings
        </Link>
      )}
    </aside>
  );
}
