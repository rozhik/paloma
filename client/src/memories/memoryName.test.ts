import { describe, it, expect, beforeAll } from 'vitest';
import i18next, { type i18n as I18n } from 'i18next';
import en from '../i18n/locales/en.json';
import uk from '../i18n/locales/uk.json';
import { memoryName } from './memoryName.js';

let i18n: I18n;

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, uk: { translation: uk } },
    interpolation: { escapeValue: false },
  });
});

const memory = { year: 2016, yearsAgo: 10, album: null, title: null };
const name = (lng: string, fields: Partial<Parameters<typeof memoryName>[0]> = {}) =>
  memoryName({ ...memory, ...fields }, i18n.getFixedT(lng));

describe('memoryName', () => {
  it('names a memory after its album and two-digit year', () => {
    expect(name('en', { year: 1991, yearsAgo: 35, album: { token: 'c9ea', name: 'Kyiv' } })).toBe("Kyiv in '91");
    expect(name('en', { year: 2005, yearsAgo: 21, album: { token: 'c9ea', name: ' Birds ' } })).toBe(" Birds  in '05");
  });

  it('names other memories by their age, with plural forms', () => {
    expect(name('en', { year: 2025, yearsAgo: 1 })).toBe('1 year ago');
    expect(name('en')).toBe('10 years ago');
    expect(name('uk')).toBe('10 років тому');
    expect(name('uk', { yearsAgo: 3 })).toBe('3 роки тому');
    expect(name('uk', { yearsAgo: 21 })).toBe('21 рік тому');
  });

  it('prefers a generated title', () => {
    expect(name('en', { title: 'Autumn in Lviv', album: { token: 'c9ea', name: 'Kyiv' } })).toBe('Autumn in Lviv');
  });
});
