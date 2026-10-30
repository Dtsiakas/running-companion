import { useSyncExternalStore } from 'react';

/** The appearance choice: follow the device, or always light, or always dark. Remembered per device. */
export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'theme';

declare global {
  interface Window {
    /** Set by public/theme.js: re-applies the theme from the stored choice. */
    __applyTheme?: () => void;
  }
}

function read(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice applies for this visit only.
    document.documentElement.dataset.theme = choice === 'dark' ? 'dark' : 'light';
  }
  window.__applyTheme?.();
  listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => 'system');
}

/** Whether the page is dark right now (whatever the reason). */
export const isDarkTheme = () => document.documentElement.dataset.theme === 'dark';
