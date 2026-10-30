import { ApiError } from '../api/client.ts';
import styles from './States.module.css';

export function Loading({ label = 'Loading' }: { label?: string }) {
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
    ? 'You’re offline and this screen hasn’t been loaded on this device before.'
    : error instanceof ApiError
      ? error.message
      : 'The server didn’t answer. It may be restarting.';
  return (
    <div className={styles.error} role="alert">
      <p>{message}</p>
      {retry ? (
        <button type="button" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
