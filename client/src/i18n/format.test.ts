import { describe, it, expect } from 'vitest';
import { formatters } from './format.js';

describe('formatters', () => {
  it.each([
    ['de', '1.234'],
    ['en', '1,234'],
    ['uk', '1 234'],
  ])('formats 1234 for %s as %s', (language, expected) => {
    // Some locales group with a (narrow) no-break space
    expect(formatters(language).formatNumber(1234).replace(/[\u00a0\u202f]/g, ' ')).toBe(expected);
  });

  it('formats a date in the language', () => {
    expect(formatters('de').formatDate('2018-10-23T12:00:00Z')).toBe('23.10.2018');
    expect(formatters('en').formatDate('2018-10-23T12:00:00Z')).toBe('Oct 23, 2018');
  });
});
