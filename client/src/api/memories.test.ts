import { describe, it, expect } from 'vitest';
import { localDate } from './memories.js';

describe('localDate', () => {
  it('writes the local calendar date with zero padding', () => {
    expect(localDate(new Date(2026, 0, 5, 0, 0, 1))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('changes at local midnight', () => {
    const lastMinute = new Date(2026, 9, 6, 23, 59);
    expect(localDate(lastMinute)).toBe('2026-10-06');
    expect(localDate(new Date(lastMinute.getTime() + 60_000))).toBe('2026-10-07');
  });
});
