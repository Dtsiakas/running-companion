import { useSyncExternalStore } from 'react';

/**
 * Chart colours from the design tokens. Recharts writes colours as SVG attributes, where CSS variables
 * aren't reliably resolved, so the hex values are read from the tokens and re-read when the theme changes
 * (the `themechange` event from public/theme.js).
 */
const NAMES = ['--series-1', '--series-2', '--ink', '--ink-2', '--ink-3', '--rule', '--surface', '--raised', '--accent', '--lane-band', '--intensity-low', '--intensity-high'] as const;
export type ThemeColors = Record<(typeof NAMES)[number], string>;

let cached: ThemeColors | null = null;

function read(): ThemeColors {
  if (!cached) {
    const style = getComputedStyle(document.documentElement);
    cached = Object.fromEntries(NAMES.map((name) => [name, style.getPropertyValue(name).trim()])) as ThemeColors;
  }
  return cached;
}

function subscribe(onChange: () => void) {
  const handler = () => {
    cached = null;
    onChange();
  };
  // public/theme.js fires this whenever the theme changes: the device setting, or the choice in the menu.
  document.addEventListener('themechange', handler);
  return () => document.removeEventListener('themechange', handler);
}

export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribe, read, read);
}
