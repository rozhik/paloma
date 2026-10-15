import { describe, it, expect } from 'vitest';
import { EFFECT_CHOICES, SLIDESHOW_EFFECTS, effectiveEffect, pickEffect, reverseOf } from './effects.js';

describe('slideshow effects', () => {
  it('has 20 effects, offered after None and Random', () => {
    expect(SLIDESHOW_EFFECTS).toHaveLength(20);
    expect(new Set(SLIDESHOW_EFFECTS).size).toBe(20);
    expect(EFFECT_CHOICES.slice(0, 2)).toEqual(['none', 'random']);
    expect(EFFECT_CHOICES).toHaveLength(22);
  });

  it('plays the chosen effect, or none', () => {
    expect(pickEffect('iris', 'iris')).toBe('iris');
    expect(pickEffect('none', 'fade')).toBe('none');
  });

  it('picks a random effect other than the previous one', () => {
    for (let i = 0; i < 20; i++) {
      const random = () => i / 20;
      expect(pickEffect('random', 'iris', random)).not.toBe('iris');
    }
    expect(pickEffect('random', null, () => 0)).toBe('fade');
    expect(pickEffect('random', 'fade', () => 0)).toBe('dipBlack');
    expect(pickEffect('random', null, () => 0.999999)).toBe('flip');
  });

  it('can reach every effect when random', () => {
    const seen = new Set(Array.from({ length: 19 }, (_, i) => pickEffect('random', 'fade', () => i / 19)));
    expect(seen.size).toBe(19);
  });

  it('reverses slides, pushes and wipes for Previous', () => {
    expect(reverseOf('slideLeft')).toBe('slideRight');
    expect(reverseOf('pushUp')).toBe('pushDown');
    expect(reverseOf('wipeRight')).toBe('wipeLeft');
    expect(reverseOf('iris')).toBe('iris');
    expect(reverseOf('none')).toBe('none');
  });

  it('fades instead with reduced motion or when the browser cannot draw the effect', () => {
    expect(effectiveEffect('flip', true)).toBe('fade');
    expect(effectiveEffect('none', true)).toBe('none');
    expect(effectiveEffect('blinds', false, (effect) => effect !== 'blinds')).toBe('fade');
    expect(effectiveEffect('iris', false)).toBe('iris');
  });
});
