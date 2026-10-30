import { m } from '../lib/i18n.ts';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { logout } from '../api/client.ts';
import { useSettings } from '../api/hooks.ts';
import { SOURCE_URL } from '../lib/source.ts';
import { useOnline } from '../lib/useOnline.ts';
import { Appearance } from './Appearance.tsx';
import { Icon, type IconName } from './icons.tsx';
import styles from './Layout.module.css';

interface NavItem {
  to: string;
  label: () => string;
  icon: IconName;
  end?: boolean;
  /** In the phone's bottom bar. The rest live under More there; the side rail shows them all. */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: () => m.app.nav.today, icon: 'today', end: true, primary: true },
  { to: '/week', label: () => m.app.nav.week, icon: 'week', primary: true },
  { to: '/runs', label: () => m.app.nav.runs, icon: 'runs', primary: true },
  { to: '/sleep', label: () => m.app.nav.sleep, icon: 'sleep', primary: true },
  { to: '/trends', label: () => m.app.nav.trends, icon: 'trends' },
  { to: '/body', label: () => m.app.nav.body, icon: 'body' },
  { to: '/progress', label: () => m.app.nav.progress, icon: 'progress' },
];

/**
 * Phones: a bottom bar with the four screens you open most and More (thumb reach; five is the most a bottom bar holds
 * comfortably). Wider screens: a side rail with every screen, and a header menu for appearance and log out.
 */
export function Layout() {
  const online = useOnline();
  const location = useLocation();
  const secondaryActive = [...NAV.filter((n) => !n.primary).map((n) => n.to), '/settings'].some((to) => location.pathname.startsWith(to));

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>
          Running Companion
          <DemoBadge />
        </span>
        <HeaderMenu />
      </header>

      <nav className={styles.nav} aria-label={m.app.nav.main}>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => [styles.link, isActive ? styles.active : '', item.primary ? '' : styles.secondary].join(' ')}>
            <span className={styles.iconWrap}>
              <Icon name={item.icon} />
            </span>
            <span className={styles.label}>{item.label()}</span>
          </NavLink>
        ))}
        <MoreButton active={secondaryActive} />
      </nav>

      <main className={styles.main}>
        {!online ? <p className={styles.offline}>{m.app.offline}</p> : null}
        <Outlet />
      </main>
    </div>
  );
}

/** Says plainly that nothing here is a real person's data. */
function DemoBadge() {
  const { data } = useSettings();
  return data?.demo ? <span className={styles.demo}>{m.app.demo}</span> : null;
}

/** Closes on a click or tap outside, on Escape, and when the page changes. */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement | null>) {
  const location = useLocation();
  useEffect(() => close(), [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

/** The laptop's header menu: appearance, settings and log out. Hidden on phones, where More holds the same. */
function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(open, close, ref);
  return (
    <div className={styles.menu} ref={ref}>
      <button type="button" className={styles.menuButton} aria-expanded={open} aria-controls="header-menu" onClick={() => setOpen((o) => !o)}>
        {m.app.nav.menu}
      </button>
      {open ? (
        <div id="header-menu" className={styles.menuPanel}>
          <Appearance />
          <NavLink className={styles.menuItem} to="/settings">
            {m.app.nav.settings}
          </NavLink>
          <a className={styles.menuItem} href={SOURCE_URL} target="_blank" rel="noreferrer">
            {m.app.nav.sourceCode}
          </a>
          <button type="button" className={styles.menuItem} onClick={() => void logout()}>
            {m.app.nav.logOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The phone's More: a sheet from the bottom with the other screens, appearance and log out. A native dialog, so
 * focus stays inside while it's open, Escape closes it, and the page behind can't be scrolled or tapped.
 */
function MoreButton({ active }: { active: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  useEffect(() => dialog.current?.close(), [location.pathname]);
  const items = NAV.filter((n) => !n.primary);
  return (
    <>
      <button type="button" className={[styles.link, styles.moreButton, active ? styles.active : ''].join(' ')} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <span className={styles.iconWrap}>
          <Icon name="more" />
        </span>
        <span className={styles.label}>{m.app.nav.more}</span>
      </button>
      <dialog
        ref={dialog}
        className={styles.sheet}
        aria-label={m.app.nav.more}
        // A tap on the dimmed area outside the sheet lands on the dialog element itself: close.
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className={styles.sheetBody}>
          <span className={styles.grabber} aria-hidden="true" />
          <ul className={styles.sheetGrid}>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => [styles.tile, isActive ? styles.tileActive : ''].join(' ')}>
                  <Icon name={item.icon} />
                  <span>{item.label()}</span>
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink to="/settings" className={({ isActive }) => [styles.tile, isActive ? styles.tileActive : ''].join(' ')}>
                <Icon name="settings" />
                <span>{m.app.nav.settings}</span>
              </NavLink>
            </li>
          </ul>
          <Appearance />
          <div className={styles.sheetFoot}>
            <button type="button" className={styles.sheetAction} onClick={() => void logout()}>
              {m.app.nav.logOut}
            </button>
            <a className={styles.sheetAction} href={SOURCE_URL} target="_blank" rel="noreferrer">
              {m.app.nav.sourceCode}
            </a>
            <button type="button" className={styles.sheetAction} onClick={() => dialog.current?.close()}>
              {m.app.nav.close}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
