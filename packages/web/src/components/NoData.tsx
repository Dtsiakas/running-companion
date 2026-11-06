import { Link } from 'react-router';
import { useSettings, useSync } from '../api/hooks.ts';
import { m } from '../lib/i18n.ts';
import blocks from '../styles/blocks.module.css';
import styles from './NoData.module.css';

/**
 * What Today shows before the first sync: a fresh install has no data, and the next step depends on whether the
 * Garmin key is there yet. Without it, the way to Settings; with it, the first sync.
 */
export function NoData() {
  const settings = useSettings();
  const sync = useSync();
  const s = m.today.empty;
  const needsKey = settings.data && !settings.data.demo && (settings.data.garmin.state === 'missing' || settings.data.garmin.state === 'rejected' || settings.data.garmin.state === 'expired');
  return (
    <section className={styles.empty} aria-labelledby="no-data-title">
      <h1 id="no-data-title" className={styles.title}>
        {s.title}
      </h1>
      {settings.data?.demo ? (
        <p>{s.demo}</p>
      ) : needsKey ? (
        <>
          <p>{s.needKey}</p>
          {settings.data?.locked.garminKey ? null : (
            <Link className={blocks.button} to="/settings">
              {s.addKey}
            </Link>
          )}
        </>
      ) : sync.isPending ? (
        <p role="status">{s.syncing}</p>
      ) : (
        <>
          <p>{s.syncNow}</p>
          {sync.isError ? <p role="alert">{m.app.sync.failed}</p> : null}
          <button type="button" className={blocks.button} onClick={() => sync.mutate()}>
            {m.app.sync.now}
          </button>
        </>
      )}
    </section>
  );
}
