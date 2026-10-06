import { describe, it, expect } from 'vitest';
import { addTags, chipKey, removeTag, tagSuggestions, typedTags } from './tagRules.js';

describe('tag rules', () => {
  it('splits typed text at commas and trims it', () => {
    expect(typedTags(' birds, ,sky ')).toEqual(['birds', 'sky']);
  });

  it('adds only tags the chips do not have, ignoring case', () => {
    expect(addTags(['Trip'], ['trip', 'Київ', 'київ'])).toEqual(['Trip', 'Київ']);
  });

  it('removes a tag ignoring case', () => {
    expect(removeTag(['old', 'River'], 'river')).toEqual(['old']);
  });

  it('suggests known tags containing the typed text, those starting with it first', () => {
    expect(tagSuggestions(['Hummingbirds', 'Birds of prey', 'sky'], 'bir', [])).toEqual(['Birds of prey', 'Hummingbirds']);
    expect(tagSuggestions(['Birds of prey'], 'bir', ['birds of prey'])).toEqual([]);
    expect(tagSuggestions(['Birds'], '  ', [])).toEqual([]);
  });

  it('adds with Enter or a comma and removes the last chip with Backspace in the empty field', () => {
    expect(chipKey('Enter', 'river', ['old'])).toEqual({ kind: 'add', tags: ['old', 'river'] });
    expect(chipKey(',', 'river', ['old'])).toEqual({ kind: 'add', tags: ['old', 'river'] });
    expect(chipKey('Enter', 'OLD', ['old'])).toEqual({ kind: 'add', tags: ['old'] });
    expect(chipKey('Backspace', '', ['old', 'river'])).toEqual({ kind: 'removeLast', tags: ['old'] });
    expect(chipKey('Backspace', 'ri', ['old', 'river'])).toEqual({ kind: 'none' });
    expect(chipKey('Enter', '', ['old'])).toEqual({ kind: 'none' });
  });
});
