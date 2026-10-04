import { describe, it, expect } from 'vitest';
import { LANGUAGES, matchLanguage, pickLanguage } from './languages.js';

describe('pickLanguage', () => {
  it.each([
    [['es-MX', 'en-US'], 'es'],
    [['nl-NL', 'uk-UA', 'en'], 'uk'],
    [['nl-NL', 'sv'], 'en'],
    [[], 'en'],
    [['zh-CN'], 'zh-Hans'],
    [['zh-TW'], 'zh-Hans'],
    [['zh'], 'zh-Hans'],
    [['pt-PT'], 'pt-BR'],
    [['pt'], 'pt-BR'],
    [['AR-eg'], 'ar'],
    [['de_AT'], 'de'],
  ])('with nothing remembered, browser %j gives %s', (browser, expected) => {
    expect(pickLanguage(null, browser)).toBe(expected);
  });

  it('prefers a remembered supported language over the browser', () => {
    expect(pickLanguage('ja', ['en-US'])).toBe('ja');
    expect(pickLanguage('zh-Hans', ['en-US'])).toBe('zh-Hans');
  });

  it.each(['xx', '', 'EN', 'zh'])('ignores the unsupported remembered value %j', (remembered) => {
    expect(pickLanguage(remembered, ['fr-FR'])).toBe('fr');
  });
});

describe('LANGUAGES', () => {
  it('lists the eleven languages in switcher order, each with its own distinct name, with Arabic right-to-left', () => {
    expect(LANGUAGES.map((l) => l.tag)).toEqual(['en', 'zh-Hans', 'es', 'ar', 'pt-BR', 'fr', 'de', 'ja', 'ru', 'id', 'uk']);
    const names = LANGUAGES.map((l) => l.nativeName.trim());
    expect(names.every((name) => name !== '')).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(LANGUAGES[0].nativeName).toBe('English');
    expect(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.tag)).toEqual(['ar']);
  });

  it('matches each supported tag to itself', () => {
    for (const { tag } of LANGUAGES) expect(matchLanguage(tag)).toBe(tag);
  });
});
