/** Languages the app is translated into. English is the source; every other language must have every message. */
export const LANGS = ['en', 'el'] as const;
export type Lang = (typeof LANGS)[number];

export interface Locale {
  lang: Lang;
}

export const DEFAULT_LOCALE: Locale = { lang: 'en' };

/** The language's name in itself, for the language picker. */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', el: 'Ελληνικά' };

export const isLang = (value: unknown): value is Lang => typeof value === 'string' && (LANGS as readonly string[]).includes(value);

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
