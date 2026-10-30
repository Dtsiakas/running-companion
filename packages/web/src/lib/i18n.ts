import { createFormat, INTL_TAG, isLang, isUnits, messages, pickLang, pickUnits, type Format, type Lang, type Locale, type Messages, type Units } from '@companion/i18n';
import { useSyncExternalStore } from 'react';

/*
 * The app's language and units. Components read `m` (messages) and `f` (formatting) as plain imports: they're live
 * bindings that `applyLocale` replaces, and the whole app re-renders when the locale changes (LocaleGate), so nothing
 * has to thread a hook through every function that writes a sentence or a number.
 *
 * The choice is per device, like Appearance: "auto" follows the device's language and region (a US phone gets miles,
 * °F and lb), and Settings can fix either one. It's sent along with every API request, because the server writes
 * some of the sentences and paces itself.
 */
export type LangChoice = Lang | 'auto';
export type UnitsChoice = Units | 'auto';

const LANG_KEY = 'language';
const UNITS_KEY = 'units';

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

export function unitsChoice(): UnitsChoice {
  const value = stored(UNITS_KEY);
  return isUnits(value) ? value : 'auto';
}

function deviceLocale(): Locale {
  const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
  return { lang: pickLang(preferences), units: pickUnits(preferences) };
}

function chosenLocale(): Locale {
  const device = deviceLocale();
  const lang = languageChoice();
  const units = unitsChoice();
  return { lang: lang === 'auto' ? device.lang : lang, units: units === 'auto' ? device.units : units };
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

/** Changes the language and/or units on this device and re-renders the app in them. */
export function setLocaleChoice(choice: { language?: LangChoice; units?: UnitsChoice }): void {
  if (choice.language) save(LANG_KEY, choice.language);
  if (choice.units) save(UNITS_KEY, choice.units);
  const device = deviceLocale();
  applyLocale({
    lang: choice.language ? (choice.language === 'auto' ? device.lang : choice.language) : locale.lang,
    units: choice.units ? (choice.units === 'auto' ? device.units : choice.units) : locale.units,
  });
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
