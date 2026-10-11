import { describe, it, expect } from 'vitest';
import { expandPrompt, languageName } from './prompt.js';

const values = { language: 'Ukrainian', maxTags: 10, photoTags: ['Family', 'sea'], description: 'Grandma', libraryTags: ['family', 'sea'] };

describe('expandPrompt', () => {
  it('fills in the library tags', () => {
    expect(expandPrompt('Prefer these tags: {libraryTags}', values)).toBe('Prefer these tags: family, sea');
  });

  it('fills in every placeholder, also more than once', () => {
    expect(expandPrompt('{maxTags} tags in {language}; has {photoTags}; "{description}"; {language}', values))
      .toBe('10 tags in Ukrainian; has Family, sea; "Grandma"; Ukrainian');
  });

  it('sends unknown placeholders as written', () => {
    expect(expandPrompt('Camera: {camera} {LANGUAGE}', values)).toBe('Camera: {camera} {LANGUAGE}');
  });

  it('leaves an empty description empty', () => {
    expect(expandPrompt('[{description}]', { ...values, description: null })).toBe('[]');
  });
});

describe('languageName', () => {
  it('names languages in English', () => {
    expect(languageName('uk')).toBe('Ukrainian');
    expect(languageName('pt-BR')).toBe('Brazilian Portuguese');
    expect(languageName('zh-Hans')).toBe('Simplified Chinese');
  });
});
