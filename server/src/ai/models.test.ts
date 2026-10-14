import { describe, it, expect } from 'vitest';
import { ModelInputError, parseModelInput, parsePrices } from './models.js';

const field = (body: unknown) => {
  try {
    parseModelInput(body);
  } catch (err) {
    return err instanceof ModelInputError ? err.field : 'other';
  }
  return null;
};

describe('parseModelInput', () => {
  it('accepts the editable fields', () => {
    expect(parseModelInput({
      enabled: true, description: 'Fast', prices: { prompt_tokens: 0.15, completion_tokens: 0 },
      capabilities: [{ name: ' tags ', grade: 0 }, { name: 'objects', grade: 100 }],
    })).toEqual({
      enabled: true, description: 'Fast', prices: { prompt_tokens: 0.15, completion_tokens: 0 },
      capabilities: [{ name: 'tags', grade: 0 }, { name: 'objects', grade: 100 }],
    });
    expect(parseModelInput({})).toEqual({});
  });

  it('names the field that cannot be saved', () => {
    expect(field('x')).toBe('');
    expect(field({ enabled: 1 })).toBe('enabled');
    expect(field({ description: 5 })).toBe('description');
    expect(field({ description: 'x'.repeat(2001) })).toBe('description');
    expect(field({ prices: { prompt_tokens: -0.01 } })).toBe('prompt_tokens');
    expect(field({ prices: { prompt_tokens: Infinity } })).toBe('prompt_tokens');
    expect(field({ prices: { cached_tokens: 1 } })).toBe('cached_tokens');
    expect(field({ capabilities: [{ name: 'a', grade: -1 }] })).toBe('capabilities');
    expect(field({ capabilities: [{ name: 'a', grade: 1 }, { name: 'A', grade: 2 }] })).toBe('capabilities');
    expect(field({ capabilities: 'tags' })).toBe('capabilities');
    expect(field({ name: 'x' })).toBe('name');
  });
});

describe('parsePrices', () => {
  it('keeps only known kinds with a usable number', () => {
    expect(parsePrices('{"prompt_tokens":1.5,"completion_tokens":-2,"x":3}')).toEqual({ prompt_tokens: 1.5 });
    expect(parsePrices('not json')).toEqual({});
  });
});
