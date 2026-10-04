import { describe, it, expect, beforeAll } from 'vitest';
import i18next, { type i18n as I18n } from 'i18next';
import en from './locales/en.json';
import uk from './locales/uk.json';
import de from './locales/de.json';
import ar from './locales/ar.json';

let i18n: I18n;

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, uk: { translation: uk }, de: { translation: de }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
});

const photos = (lng: string, count: number) => i18n.t('common.photos', { lng, count }).replace(/[\u00a0\u202f]/g, ' ');
/** A catalog text with its count filled in, as the expected result for that plural form. */
const filled = (text: string, count: number) => text.replace('{{count, number}}', String(count));

describe('counts in texts', () => {
  it.each([
    [1, uk.common.photos_one], [3, uk.common.photos_few], [5, uk.common.photos_many], [21, uk.common.photos_one],
  ])('Ukrainian %i uses the form %s', (count, form) => expect(photos('uk', count)).toBe(filled(form, count)));

  it.each([[1, '1 photo'], [2, '2 photos'], [1234, '1,234 photos']])(
    'English %i reads %s', (count, expected) => expect(photos('en', count)).toBe(expected),
  );

  it('formats the count in German', () => {
    expect(photos('de', 1234)).toBe('1.234 Fotos');
  });

  it('uses the Arabic dual', () => {
    expect(photos('ar', 2)).toBe(filled(ar.common.photos_two, 2));
  });

  it('falls back to English for a text missing in the active language', () => {
    const partial = i18next.createInstance();
    partial.init({ lng: 'id', fallbackLng: 'en', resources: { en: { translation: en }, id: { translation: {} } } });
    expect(partial.t('tray.clear')).toBe('Clear');
  });
});
