import { createFormat, INTL_TAG, isLang, messages, pickLang, type Format, type Lang, type Locale, type Messages } from '@companion/i18n';
import { useSyncExternalStore } from 'react';

/*
 * The app's language. Components read `m` (messages) and `f` (formatting) as plain imports: they're live
 * bindings that `applyLocale` replaces, and the whole app re-renders when the locale changes (LocaleGate), so nothing
 * has to thread a hook through every function that writes a sentence or a number.
 *
 * The choice is per device, like Appearance: "auto" follows the device's language, and Settings can fix it. It's
 * sent along with every API request, because the server writes some of the sentences itself.
 */
export type LangChoice = Lang | 'auto';

const LANG_KEY = 'language';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode): follow the device
  }
}

export function languageChoice(): LangChoice {
  const value = stored(LANG_KEY);
  return isLang(value) ? value : 'auto';
}

function deviceLocale(): Locale {
  const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
  return { lang: pickLang(preferences) };
}

function chosenLocale(): Locale {
  const device = deviceLocale();
  const lang = languageChoice();
  return { lang: lang === 'auto' ? device.lang : lang };
}

export let locale: Locale = chosenLocale();
export let m: Messages = messages(locale.lang);
export let f: Format = createFormat(locale);

function applyLocale(next: Locale): void {
  locale = next;
  m = messages(next.lang);
  f = createFormat(next);
  document.documentElement.lang = INTL_TAG[next.lang].slice(0, 2);
}
applyLocale(locale);

const listeners = new Set<() => void>();
let version = 0;

function save(key: string, value: string): void {
  try {
    if (value === 'auto') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not remembered, but still applied for this visit below.
  }
}

/** Changes the language on this device and re-renders the app in it. */
export function setLocaleChoice(choice: { language?: LangChoice }): void {
  if (choice.language) save(LANG_KEY, choice.language);
  const device = deviceLocale();
  applyLocale({ lang: choice.language ? (choice.language === 'auto' ? device.lang : choice.language) : locale.lang });
  version += 1;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** A number that changes whenever the locale does: the key that re-renders the app. */
export const useLocaleVersion = () => useSyncExternalStore(subscribe, () => version);

/** The current locale as one object, for shared code that takes one (the fuel planner). */
export const current = () => ({ locale, m, f });
