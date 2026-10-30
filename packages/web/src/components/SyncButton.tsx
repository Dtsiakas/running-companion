import { m } from '../lib/i18n.ts';
import { useSettings, useSync } from '../api/hooks.ts';
import { syncedAt } from '../lib/dates.ts';
import blocks from '../styles/blocks.module.css';
import styles from './SyncButton.module.css';

/** Shows when Garmin data last arrived, and pulls new data on demand. */
export function SyncButton({ lastSync }: { lastSync: string | null | undefined }) {
  const sync = useSync();
  const settings = useSettings();
  if (settings.data?.demo) return <p className={styles.when}>{m.app.sync.demo}</p>;
  return (
    <div className={styles.sync}>
      <span className={styles.when}>{sync.isPending ? m.app.sync.syncing : sync.isError ? m.app.sync.failed : m.app.sync.synced(syncedAt(lastSync))}</span>
      <button type="button" className={blocks.button} onClick={() => sync.mutate()} disabled={sync.isPending}>
        {m.app.sync.now}
      </button>
    </div>
  );
}
