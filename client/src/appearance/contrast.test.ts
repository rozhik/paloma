import { describe, it, expect } from 'vitest';
import { BLACK, WHITE, composite, contrast, hexContrast, parseHex, rgbTriple } from './contrast.js';

describe('contrast', () => {
  it('parses short, long and alpha hex', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex('#0d6efd')).toEqual({ r: 13, g: 110, b: 253, a: 1 });
    expect(parseHex('#00000080')!.a).toBeCloseTo(0.502, 2);
    expect(parseHex('red')).toBeNull();
  });

  it('gives 21:1 for black on white and 1:1 for equal colors', () => {
    expect(hexContrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(hexContrast('#fff', '#000')).toBeCloseTo(21, 5);
    expect(hexContrast('#777', '#777')).toBeCloseTo(1, 5);
  });

  it('matches known WCAG values', () => {
    expect(hexContrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(hexContrast('#0d6efd', '#ffffff')).toBeCloseTo(4.5, 1);
  });

  it('composites a translucent color over its background', () => {
    expect(composite({ ...WHITE, a: 0.5 }, BLACK).r).toBeCloseTo(127.5, 5);
  });

  it('takes the worse of black and white under a translucent background', () => {
    // Half-transparent white: over black it is mid grey, where white text is weak
    const glass = { ...WHITE, a: 0.5 };
    expect(contrast(WHITE, glass)).toBeLessThan(contrast(BLACK, glass));
    expect(contrast(BLACK, glass)).toBeLessThan(21);
  });

  it('rejects colors that are not hex', () => {
    expect(() => hexContrast('rgb(0,0,0)', '#fff')).toThrow();
  });

  it('formats an rgb triple', () => {
    expect(rgbTriple('#0d6efd')).toBe('13, 110, 253');
  });
});
