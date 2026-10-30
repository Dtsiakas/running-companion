import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFormat, createI18n, LANGS, messages, parseAcceptLanguage, pickLang, pickUnits } from '@companion/i18n';

test('every language has every message, and none is left empty or in English by mistake', () => {
  const en = messages('en');
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    const other = messages(lang);
    const walk = (a: unknown, b: unknown, path: string) => {
      if (typeof a === 'string') {
        assert.equal(typeof b, 'string', `${lang}: ${path} should be text`);
        assert.ok((b as string).trim(), `${lang}: ${path} is empty`);
        return;
      }
      if (typeof a === 'function') {
        assert.equal(typeof b, 'function', `${lang}: ${path} should take values`);
        return;
      }
      for (const key of Object.keys(a as object)) {
        assert.ok(key in (b as object), `${lang}: ${path}.${key} is missing`);
        walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
      }
    };
    walk(en, other, lang);
  }
});

test('units and decimal commas follow the locale', () => {
  const metric = createFormat({ lang: 'en', units: 'metric' });
  const imperial = createFormat({ lang: 'en', units: 'imperial' });
  const greek = createFormat({ lang: 'el', units: 'metric' });
  assert.equal(metric.distance(10), '10 km');
  assert.equal(imperial.distance(10), '6.2 mi');
  assert.equal(greek.distance(12.34), '12,3 km');
  assert.equal(metric.pace(1000 / 300), '5:00/km');
  assert.equal(imperial.pace(1000 / 300), '8:03/mi');
  assert.equal(imperial.temperature(20), '68°F');
  assert.equal(imperial.weight(70), '154.3 lb');
  assert.equal(greek.number(6407), '6.407');
  assert.equal(metric.signed(-2.5, 1), '−2.5');
  assert.equal(greek.longDay('2026-10-31'), 'Σάββατο 31 Οκτωβρίου');
  assert.equal(createI18n().m.app.nav.close, 'Close');
});

test('language and units from the browser or an Accept-Language header', () => {
  assert.deepEqual(parseAcceptLanguage('el-GR,el;q=0.9,en;q=0.8'), ['el-GR', 'el', 'en']);
  assert.equal(pickLang(parseAcceptLanguage('fr-FR,el;q=0.5')), 'el');
  assert.equal(pickLang(['de-DE']), 'en');
  assert.equal(pickUnits(['en-US']), 'imperial');
  assert.equal(pickUnits(['en-GB']), 'metric');
});
