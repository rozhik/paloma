import { describe, it, expect } from 'vitest';
import { isBirth, parseLink, parsePersonInput } from './personValidation.js';

const TODAY = new Date('2026-10-06T12:00:00Z');
const parse = (body: unknown, known = true) => parsePersonInput(body, known, TODAY);
const errorOf = (body: unknown, known = true) => {
  const result = parse(body, known);
  return 'code' in result ? { code: result.code, field: result.params?.field } : null;
};

describe('parsePersonInput', () => {
  it('accepts a full profile and normalizes texts', () => {
    expect(parse({
      name: '  Roy Avery ', alias: ' Roy ', comment: 'Uncle', links: ['https://example.com/roy', ' http://social.example/roy '],
      birth: '1961', gender: 'male', avatar: { photoId: 7, rect: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 } },
    })).toEqual({
      name: 'Roy Avery', alias: 'Roy', comment: 'Uncle', links: ['https://example.com/roy', 'http://social.example/roy'],
      birth: '1961', gender: 'male', avatar: { photoId: 7, rect: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 } },
    });
  });

  it('clears fields with null or an empty text', () => {
    expect(parse({ alias: '', comment: null, birth: null, gender: null, avatar: null, links: [''] }))
      .toEqual({ alias: null, comment: null, birth: null, gender: null, avatar: null, links: [] });
  });

  it('accepts an empty body, which creates an unknown person', () => {
    expect(parse({}, false)).toEqual({});
  });

  it.each([
    [{ links: ['javascript:alert(1)'] }, 'invalid_field', 'links'],
    [{ links: ['example.com'] }, 'invalid_field', 'links'],
    [{ links: 'https://example.com' }, 'invalid_field', 'links'],
    [{ links: Array.from({ length: 21 }, (_, i) => `https://example.com/${i}`) }, 'invalid_field', 'links'],
    [{ birth: '1990-02-30' }, 'invalid_field', 'birth'],
    [{ birth: '2027' }, 'invalid_field', 'birth'],
    [{ birth: '2026-10-07' }, 'invalid_field', 'birth'],
    [{ birth: '90' }, 'invalid_field', 'birth'],
    [{ gender: 'other' }, 'invalid_field', 'gender'],
    [{ alias: 5 }, 'invalid_field', 'alias'],
    [{ name: 'x'.repeat(201) }, 'invalid_field', 'name'],
    [{ avatar: { photoId: 7 } }, 'invalid_field', 'avatar'],
    [{ name: '  ' }, 'person_name_required', undefined],
    [[], 'invalid_body', undefined],
  ])('rejects %j', (body, code, field) => {
    expect(errorOf(body)).toEqual({ code, field });
  });

  it('rejects profile fields for an unknown person unless the name comes with them', () => {
    expect(errorOf({ alias: 'Bear' }, false)).toEqual({ code: 'person_name_required', field: undefined });
    expect(parse({ name: 'Ann', alias: 'Annie' }, false)).toEqual({ name: 'Ann', alias: 'Annie' });
  });

  it('accepts a year or today as birth', () => {
    expect(isBirth('1961', TODAY)).toBe(true);
    expect(isBirth('2026-10-06', TODAY)).toBe(true);
    expect(isBirth('2000-02-29', TODAY)).toBe(true);
    expect(isBirth('1999-02-29', TODAY)).toBe(false);
  });

  it('keeps links as typed and only http and https', () => {
    expect(parseLink(' https://Example.com/Roy ')).toBe('https://Example.com/Roy');
    expect(parseLink('ftp://example.com')).toBeNull();
  });
});
