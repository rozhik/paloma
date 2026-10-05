import { describe, it, expect } from 'vitest';
import { LEVELS, atLeast, isLevel } from './levels.js';

describe('levels', () => {
  it('are ordered from child to developer', () => {
    expect([...LEVELS]).toEqual(['child', 'easy', 'normal', 'pro', 'developer']);
  });

  it('include every lower level', () => {
    expect(atLeast('pro', 'easy')).toBe(true);
    expect(atLeast('easy', 'easy')).toBe(true);
    expect(atLeast('easy', 'normal')).toBe(false);
    expect(atLeast('child', 'easy')).toBe(false);
  });

  it('let developer use everything', () => {
    for (const level of LEVELS) expect(atLeast('developer', level)).toBe(true);
  });

  it('recognise only the five ids', () => {
    expect(isLevel('pro')).toBe(true);
    expect(isLevel('expert')).toBe(false);
    expect(isLevel(undefined)).toBe(false);
  });
});
