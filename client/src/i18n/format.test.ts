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

  it('formats a range of calendar days in the language', () => {
    const range = (language: string) => formatters(language).formatDayRange('2016-10-03', '2016-10-09').replace(/[\u2009\u00a0\u202f]/g, ' ');
    expect(range('en')).toBe('Oct 3 – 9, 2016');
    expect(formatters('en').formatDayRange('2015-12-29', '2016-01-04')).toMatch(/Dec 29, 2015.*Jan 4, 2016/);
  });
});
