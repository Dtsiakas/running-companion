import { useState, type FormEvent } from 'react';
import { useSettings, useSaveSetting, type SettingsResponse } from '../api/hooks.ts';
import { Appearance } from '../components/Appearance.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { longDay } from '../lib/dates.ts';
import { keySentence } from '../lib/garminKey.ts';
import { SOURCE_URL } from '../lib/source.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Settings.module.css';

const GARMIN_KEY_PAGE = 'https://connect.garmin.com/app/settings/personalApiToken';

export function Settings() {
  const settings = useSettings();
  if (settings.isPending) return <Loading />;
  if (settings.isError) return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  const s = settings.data;
  return (
    <div className={blocks.page}>
      <header className={blocks.pageTop}>
        <h1 className={blocks.title}>Settings</h1>
      </header>

      <Section title="Garmin key">
        <KeyState garmin={s.garmin} />
        {s.locked.garminKey ? (
          <p className={blocks.explain}>The key is set on the server (GARMIN_PERSONAL_API_KEY). Change it there.</p>
        ) : (
          <>
            <ReplaceKey hasKey={s.garmin.source !== null} />
            {s.garmin.source === 'settings' ? <ExpiryDate expiresOn={s.garmin.expiresOn} /> : null}
          </>
        )}
      </Section>

      <Section title="Appearance">
        <div className={styles.appearance}>
          <Appearance showLegend={false} />
        </div>
      </Section>

      <Section title="Password">
        {s.locked.password ? <p className={blocks.explain}>The password is set on the server (PASSWORD_HASH). Change it there.</p> : <ChangePassword />}
      </Section>

      <Section title="About">
        <p className={blocks.explain}>
          Running Companion is free software under the AGPL. <a href={SOURCE_URL} target="_blank" rel="noreferrer">Source code</a>
        </p>
      </Section>
    </div>
  );
}

const STATE_TEXT: Record<SettingsResponse['garmin']['state'], { tone: 'green' | 'amber' | 'red'; label: string }> = {
  ok: { tone: 'green', label: 'Working' },
  expiring: { tone: 'amber', label: 'Expires soon' },
  expired: { tone: 'red', label: 'Expired' },
  rejected: { tone: 'red', label: 'Refused by Garmin' },
  missing: { tone: 'red', label: 'No key yet' },
};

function KeyState({ garmin }: { garmin: SettingsResponse['garmin'] }) {
  const state = STATE_TEXT[garmin.state];
  return (
    <div className={styles.keyState}>
      <p className={blocks.status} data-status={state.tone}>
        <i aria-hidden="true" />
        {state.label}
      </p>
      <p className={blocks.explain}>{keySentence(garmin, 'below')}</p>
      {garmin.addedOn && garmin.source === 'settings' ? <p className={styles.small}>Added on {longDay(garmin.addedOn)}.</p> : null}
    </div>
  );
}

function ReplaceKey({ hasKey }: { hasKey: boolean }) {
  const save = useSaveSetting<{ key: string; expiresOn: string | null }>('/garmin-key');
  const [key, setKey] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ key: key.trim(), expiresOn: expiresOn || null }, { onSuccess: () => (setKey(''), setExpiresOn('')) });
  };
  return (
    <form className={styles.form} onSubmit={submit}>
      <h3>{hasKey ? 'Replace the key' : 'Add your key'}</h3>
      <p className={styles.small}>
        Create it at{' '}
        <a href={GARMIN_KEY_PAGE} target="_blank" rel="noreferrer">
          Garmin Connect
        </a>
        . It’s checked with Garmin before it’s saved, and never shown again.
      </p>
      <label>
        <span>API key</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} required />
      </label>
      <label>
        <span>Expires on (optional)</span>
        <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <button type="submit" className={blocks.button} disabled={save.isPending || !key.trim()}>
          {save.isPending ? 'Checking with Garmin…' : 'Save key'}
        </button>
        <Outcome mutation={save} done="Saved. Syncing with the new key." />
      </div>
    </form>
  );
}

function ExpiryDate({ expiresOn }: { expiresOn: string | null }) {
  const save = useSaveSetting<{ expiresOn: string | null }>('/garmin-key/expiry');
  const [value, setValue] = useState(expiresOn ?? '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ expiresOn: value || null });
  };
  return (
    <form className={styles.form} onSubmit={submit}>
      <h3>Expiry date of the current key</h3>
      <p className={styles.small}>Garmin shows it next to the key. With it, the app reminds you two weeks before.</p>
      <label>
        <span>Expires on</span>
        <input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <button type="submit" className={blocks.button} disabled={save.isPending || value === (expiresOn ?? '')}>
          Save date
        </button>
        <Outcome mutation={save} done="Saved." />
      </div>
    </form>
  );
}

function ChangePassword() {
  const save = useSaveSetting<{ current: string; next: string }>('/password');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const mismatch = repeat.length > 0 && next !== repeat;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (next !== repeat) return;
    save.mutate({ current, next }, { onSuccess: () => (setCurrent(''), setNext(''), setRepeat('')) });
  };
  return (
    <form className={`${styles.form} ${styles.first}`} onSubmit={submit}>
      <p className={styles.small}>Changing it logs out every other browser and phone. Claude’s connector keeps working.</p>
      <label>
        <span>Current password</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </label>
      <label>
        <span>New password (at least 12 characters)</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={12} required />
      </label>
      <label>
        <span>Repeat it</span>
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={12} required aria-invalid={mismatch} />
      </label>
      {mismatch ? <p className={styles.error}>The two new passwords differ.</p> : null}
      <div className={styles.actions}>
        <button type="submit" className={blocks.button} disabled={save.isPending || mismatch}>
          Change password
        </button>
        <Outcome mutation={save} done="Changed. Other devices need the new password." />
      </div>
    </form>
  );
}

function Outcome({ mutation, done }: { mutation: { isSuccess: boolean; isError: boolean; error: Error | null }; done: string }) {
  if (mutation.isError) return <p className={styles.error} role="alert">{mutation.error?.message}</p>;
  if (mutation.isSuccess) return <p className={styles.done} role="status">{done}</p>;
  return null;
}
