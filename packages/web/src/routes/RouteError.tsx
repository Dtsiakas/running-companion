import { useEffect, useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import styles from './RouteError.module.css';

const RELOADED = 'reloaded-after-error';

/**
 * Shown instead of a blank crash when a screen fails. The usual cause is an update: the installed app was still
 * running the previous version from its offline copy while the server already sent the new data. So the first thing
 * it does is fetch the new version and reload, once per visit; if the error survives that, it's a real bug and the
 * message stays, with the details folded away.
 */
export function RouteError() {
  const error = useRouteError();
  const [reloading, setReloading] = useState(false);
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error);

  const reload = async () => {
    setReloading(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch {
      // Offline or no service worker: a plain reload is still the best try.
    }
    window.location.reload();
  };

  useEffect(() => {
    let alreadyTried = false;
    try {
      alreadyTried = sessionStorage.getItem(RELOADED) === '1';
      sessionStorage.setItem(RELOADED, '1');
    } catch {
      alreadyTried = true; // can't remember the attempt, so don't risk a reload loop
    }
    if (!alreadyTried) void reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.error} role="alert">
      <h1>{reloading ? 'Updating the app…' : 'This screen couldn’t load'}</h1>
      <p>Usually this means the app was just updated and this device still had the previous version. Reloading fetches the new one.</p>
      <button type="button" onClick={() => void reload()} disabled={reloading}>
        Reload
      </button>
      <details>
        <summary>Details</summary>
        <pre>{message}</pre>
      </details>
    </div>
  );
}
