import { describe, it, expect } from 'vitest';
import { creditsFor } from './usage.js';

describe('creditsFor', () => {
  it('prices each token kind per 1,000,000 tokens', () => {
    expect(creditsFor({ prompt_tokens: 1_000_000, completion_tokens: 500_000 }, { prompt_tokens: 0.15, completion_tokens: 0.6 })).toBe(0.45);
    expect(creditsFor({ prompt_tokens: 812, completion_tokens: 40 }, { prompt_tokens: 2, completion_tokens: 10 })).toBeCloseTo(0.002024, 10);
  });

  it('costs nothing for a kind without a price, for kinds it does not price, and for unknown tokens', () => {
    expect(creditsFor({ prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, { prompt_tokens: 1 })).toBe(1);
    expect(creditsFor({ reasoning_tokens: 1_000_000 }, { prompt_tokens: 1, completion_tokens: 1 })).toBe(0);
    expect(creditsFor(null, { prompt_tokens: 1 })).toBe(0);
    expect(creditsFor({ prompt_tokens: 5 }, {})).toBe(0);
  });
});
