import { useSettings, useSync } from '../api/hooks.ts';
import { syncedAt } from '../lib/dates.ts';
import blocks from '../styles/blocks.module.css';
import styles from './SyncButton.module.css';

/** Shows when Garmin data last arrived, and pulls new data on demand. */
export function SyncButton({ lastSync }: { lastSync: string | null | undefined }) {
  const sync = useSync();
  const settings = useSettings();
  if (settings.data?.demo) return <p className={styles.when}>Demo data, generated for you</p>;
  return (
    <div className={styles.sync}>
      <span className={styles.when}>{sync.isPending ? 'Syncing with Garmin…' : sync.isError ? 'Sync failed. Try again later.' : `Synced ${syncedAt(lastSync)}`}</span>
      <button type="button" className={blocks.button} onClick={() => sync.mutate()} disabled={sync.isPending}>
        Sync now
      </button>
    </div>
  );
}
