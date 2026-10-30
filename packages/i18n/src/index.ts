import { createFormat, type Format } from './format.ts';
import { DEFAULT_LOCALE, type Lang, type Locale } from './locale.ts';
import { AREAS } from './messages/index.ts';

export * from './format.ts';
export * from './locale.ts';
export { define, plural } from './define.ts';

type Areas = typeof AREAS;
export type Messages = { [K in keyof Areas]: Areas[K]['en'] };

const cache = new Map<Lang, Messages>();

/** Every message in one language. */
export function messages(lang: Lang): Messages {
  let found = cache.get(lang);
  if (!found) {
    found = Object.fromEntries(Object.entries(AREAS).map(([area, pair]) => [area, pair[lang]])) as Messages;
    cache.set(lang, found);
  }
  return found;
}

export interface I18n {
  locale: Locale;
  /** Formatting: numbers, units, dates. */
  f: Format;
  /** Messages. */
  m: Messages;
}

export function createI18n(locale: Locale = DEFAULT_LOCALE): I18n {
  return { locale, f: createFormat(locale), m: messages(locale.lang) };
}

/** English and metric: what the AI connector and the tests use unless told otherwise. */
export const ENGLISH: I18n = createI18n(DEFAULT_LOCALE);
