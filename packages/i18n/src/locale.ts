/** Languages the app is translated into. English is the source; every other language must have every message. */
export const LANGS = ['en', 'el'] as const;
export type Lang = (typeof LANGS)[number];
export type Units = 'metric' | 'imperial';

export interface Locale {
  lang: Lang;
  units: Units;
}

export const DEFAULT_LOCALE: Locale = { lang: 'en', units: 'metric' };

/** The language's name in itself, for the language picker. */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', el: 'Ελληνικά' };

export const isLang = (value: unknown): value is Lang => typeof value === 'string' && (LANGS as readonly string[]).includes(value);
export const isUnits = (value: unknown): value is Units => value === 'metric' || value === 'imperial';

/**
 * The first supported language in a preference list ("el-GR", "en-US", or an Accept-Language header's entries),
 * falling back to English.
 */
export function pickLang(preferences: readonly string[]): Lang {
  for (const tag of preferences) {
    const base = tag.trim().split(/[-_;]/)[0]?.toLowerCase();
    if (isLang(base)) return base;
  }
  return 'en';
}

/** Countries that run in miles and Fahrenheit. The UK runs in miles too, but weighs in kg and stones and reads °C. */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

export function pickUnits(preferences: readonly string[]): Units {
  const region = preferences[0]?.split(/[-_]/)[1]?.toUpperCase();
  return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
}

/** "el-GR,el;q=0.9,en;q=0.8" → ["el-GR", "el", "en"], highest preference first. */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = Number(params.find((p) => p.trim().startsWith('q='))?.trim().slice(2) ?? 1);
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag && entry.tag !== '*')
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

/** The BCP 47 tag Intl uses for dates and numbers. */
export const INTL_TAG: Record<Lang, string> = { en: 'en-GB', el: 'el-GR' };
