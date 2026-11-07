import { createI18n, isLang, parseAcceptLanguage, pickLang, type I18n } from '@companion/i18n';
import type { Request } from 'express';

/**
 * The language to answer in. The dashboard says so on every request (?lang=el: it knows the
 * person's choice); otherwise, as for the login and setup pages, the browser's Accept-Language decides the language.
 */
export function requestI18n(req: Request): I18n {
  const lang = isLang(req.query.lang) ? req.query.lang : pickLang(parseAcceptLanguage(req.headers['accept-language']));
  return createI18n({ lang });
}
