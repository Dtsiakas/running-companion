import { m } from '../lib/i18n.ts';
import { ApiError } from '../api/client.ts';
import styles from './States.module.css';

export function Loading({ label = m.app.states.loading }: { label?: string }) {
  return (
    <p className={styles.loading} role="status">
      {label}…
    </p>
  );
}

/** Errors say what happened and what to do, not just that something went wrong. */
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const offline = !navigator.onLine;
  const message = offline
    ? m.app.states.offlineNotLoaded
    : error instanceof ApiError
      ? error.message
      : m.app.states.serverNoAnswer;
  return (
    <div className={styles.error} role="alert">
      <p>{message}</p>
      {retry ? (
        <button type="button" onClick={retry}>
          {m.app.states.tryAgain}
        </button>
      ) : null}
    </div>
  );
}
