import { createI18n, isLang, isUnits, parseAcceptLanguage, pickLang, type I18n } from '@companion/i18n';
import type { Request } from 'express';

/**
 * The language and units to answer in. The dashboard says so on every request (?lang=el&units=imperial: it knows the
 * person's choice); otherwise, as for the login and setup pages, the browser's Accept-Language decides the language.
 */
export function requestI18n(req: Request): I18n {
  const lang = isLang(req.query.lang) ? req.query.lang : pickLang(parseAcceptLanguage(req.headers['accept-language']));
  const units = isUnits(req.query.units) ? req.query.units : 'metric';
  return createI18n({ lang, units });
}
