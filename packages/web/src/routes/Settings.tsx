import { LANG_NAMES, LANGS } from '@companion/i18n';
import { useState, type FormEvent } from 'react';
import { useDisconnectClaude, useSettings, useSaveSetting, type SettingsResponse } from '../api/hooks.ts';
import { Appearance } from '../components/Appearance.tsx';
import { Choice } from '../components/Choice.tsx';
import { useChangeLocale } from '../components/LocaleGate.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { keySentence } from '../lib/garminKey.ts';
import { f, languageChoice, m, unitsChoice, type LangChoice, type UnitsChoice } from '../lib/i18n.ts';
import { SOURCE_URL, VERSION } from '../lib/source.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Settings.module.css';

const GARMIN_KEY_PAGE = 'https://connect.garmin.com/app/settings/personalApiToken';

export function Settings() {
  const settings = useSettings();
  if (settings.isPending) return <Loading />;
  if (settings.isError) return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  const s = settings.data;
  const t = m.settings;
  return (
    <div className={blocks.page}>
      <header className={blocks.pageTop}>
        <h1 className={blocks.title}>{t.title}</h1>
      </header>

      {s.demo ? (
        <Section title={t.demoTitle}>
          <p className={blocks.explain}>{t.demoText}</p>
        </Section>
      ) : (
        <Section title={t.garminTitle}>
          <KeyState garmin={s.garmin} />
          {s.locked.garminKey ? (
            <p className={blocks.explain}>{t.keyLockedEnv}</p>
          ) : (
            <>
              <ReplaceKey hasKey={s.garmin.source !== null} />
              {s.garmin.source === 'settings' ? <ExpiryDate expiresOn={s.garmin.expiresOn} /> : null}
            </>
          )}
        </Section>
      )}

      <Section title={t.languageTitle}>
        <LanguageAndUnits />
      </Section>

      <Section title={m.app.appearance.legend}>
        <div className={styles.appearance}>
          <Appearance showLegend={false} />
        </div>
      </Section>

      {s.claude ? (
        <Section title={t.claude.title}>
          <ClaudeConnection claude={s.claude} />
        </Section>
      ) : null}

      {s.demo ? null : (
        <Section title={t.passwordTitle}>{s.locked.password ? <p className={blocks.explain}>{t.passwordLocked}</p> : <ChangePassword />}</Section>
      )}

      {s.backups ? (
        <Section title={t.backups.title}>
          <Backups backups={s.backups} />
        </Section>
      ) : null}

      <Section title={t.aboutTitle}>
        <p className={blocks.explain}>
          {t.version(VERSION)} {t.about}{' '}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            {t.sourceCode}
          </a>
        </p>
      </Section>
    </div>
  );
}

function ClaudeConnection({ claude }: { claude: NonNullable<SettingsResponse['claude']> }) {
  const t = m.settings.claude;
  const disconnect = useDisconnectClaude();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!claude.connectorUrl) return;
    void navigator.clipboard?.writeText(claude.connectorUrl).then(() => setCopied(true));
  };
  return (
    <div className={styles.keyState}>
      <p className={blocks.status} data-status={claude.connected ? 'green' : undefined}>
        <i aria-hidden="true" />
        {claude.connected ? t.connected : t.notConnected}
      </p>
      <p className={blocks.explain}>{claude.connected && claude.lastActive ? t.lastActive(f.dayMonthYear(new Date(claude.lastActive).toLocaleDateString('en-CA'))) : t.howTo}</p>
      {claude.connectorUrl ? (
        <div className={styles.form}>
          <label>
            <span>{t.address}</span>
            <input type="text" value={claude.connectorUrl} readOnly onFocus={(event) => event.currentTarget.select()} spellCheck={false} />
          </label>
          <div className={styles.actions}>
            <button type="button" className={blocks.button} onClick={copy}>
              {t.copy}
            </button>
            {copied ? (
              <p className={styles.done} role="status">
                {t.copied}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {claude.connected ? (
        <div className={styles.form}>
          {confirming ? (
            <>
              <p className={styles.small}>{t.confirm}</p>
              <div className={styles.actions}>
                <button type="button" className={blocks.button} disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSettled: () => setConfirming(false) })}>
                  {t.confirmButton}
                </button>
                <button type="button" className={blocks.button} onClick={() => setConfirming(false)}>
                  {t.cancel}
                </button>
              </div>
            </>
          ) : (
            <div className={styles.actions}>
              <button type="button" className={blocks.button} onClick={() => setConfirming(true)}>
                {t.disconnect}
              </button>
            </div>
          )}
        </div>
      ) : null}
      {disconnect.isSuccess && !claude.connected ? (
        <p className={styles.done} role="status">
          {t.disconnected}
        </p>
      ) : null}
      {disconnect.isError ? (
        <p className={styles.error} role="alert">
          {disconnect.error.message}
        </p>
      ) : null}
    </div>
  );
}

function Backups({ backups }: { backups: NonNullable<SettingsResponse['backups']> }) {
  const t = m.settings.backups;
  return (
    <div className={styles.keyState}>
      <p className={blocks.explain}>
        {[
          backups.latest ? t.latest(f.dayMonthYear(new Date(backups.latest).toLocaleDateString('en-CA'))) : backups.keep ? t.none : null,
          !backups.keep ? t.off : backups.automatic ? t.kept(backups.automatic, backups.keep) : null,
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
      <p className={styles.small}>{t.byHand}</p>
    </div>
  );
}

/** Per device, like Appearance: a phone can be in Greek while the laptop stays in English. */
function LanguageAndUnits() {
  const change = useChangeLocale();
  const t = m.settings;
  return (
    <div className={styles.appearance}>
      <Choice<LangChoice>
        legend={t.language}
        value={languageChoice()}
        options={[['auto', t.followDevice], ...LANGS.map((lang): [LangChoice, string] => [lang, LANG_NAMES[lang]])]}
        onChange={(language) => change({ language })}
      />
      <Choice<UnitsChoice>
        legend={t.units}
        value={unitsChoice()}
        options={[
          ['auto', t.followDevice],
          ['metric', t.metric],
          ['imperial', t.imperial],
        ]}
        onChange={(units) => change({ units })}
      />
    </div>
  );
}

const TONE: Record<SettingsResponse['garmin']['state'], 'green' | 'amber' | 'red'> = { ok: 'green', expiring: 'amber', expired: 'red', rejected: 'red', missing: 'red' };

function KeyState({ garmin }: { garmin: SettingsResponse['garmin'] }) {
  return (
    <div className={styles.keyState}>
      <p className={blocks.status} data-status={TONE[garmin.state]}>
        <i aria-hidden="true" />
        {m.settings.state[garmin.state]}
      </p>
      <p className={blocks.explain}>{keySentence(garmin, m.settings.where.below)}</p>
      {garmin.addedOn && garmin.source === 'settings' ? <p className={styles.small}>{m.settings.addedOn(f.dayMonthYear(garmin.addedOn))}</p> : null}
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
      <h3>{hasKey ? m.settings.replace : m.settings.add}</h3>
      <p className={styles.small}>
        {m.settings.createAt}{' '}
        <a href={GARMIN_KEY_PAGE} target="_blank" rel="noreferrer">
          Garmin Connect
        </a>
        {m.settings.checkedNote}
      </p>
      <label>
        <span>{m.settings.apiKey}</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} required />
      </label>
      <label>
        <span>{m.settings.expiresOptional}</span>
        <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <button type="submit" className={blocks.button} disabled={save.isPending || !key.trim()}>
          {save.isPending ? m.settings.checking : m.settings.saveKey}
        </button>
        <Outcome mutation={save} done={m.settings.keySaved} />
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
      <h3>{m.settings.expiryTitle}</h3>
      <p className={styles.small}>{m.settings.expiryHint}</p>
      <label>
        <span>{m.settings.expiresOn}</span>
        <input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <button type="submit" className={blocks.button} disabled={save.isPending || value === (expiresOn ?? '')}>
          {m.settings.saveDate}
        </button>
        <Outcome mutation={save} done={m.settings.saved} />
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
      <p className={styles.small}>{m.settings.passwordNote}</p>
      <label>
        <span>{m.settings.currentPassword}</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </label>
      <label>
        <span>{m.settings.newPassword}</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={12} required />
      </label>
      <label>
        <span>{m.settings.repeat}</span>
        <input
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
          aria-invalid={mismatch}
        />
      </label>
      {mismatch ? <p className={styles.error}>{m.settings.mismatch}</p> : null}
      <div className={styles.actions}>
        <button type="submit" className={blocks.button} disabled={save.isPending || mismatch}>
          {m.settings.changePassword}
        </button>
        <Outcome mutation={save} done={m.settings.passwordChanged} />
      </div>
    </form>
  );
}

function Outcome({ mutation, done }: { mutation: { isSuccess: boolean; isError: boolean; error: Error | null }; done: string }) {
  if (mutation.isError)
    return (
      <p className={styles.error} role="alert">
        {mutation.error?.message}
      </p>
    );
  if (mutation.isSuccess)
    return (
      <p className={styles.done} role="status">
        {done}
      </p>
    );
  return null;
}
