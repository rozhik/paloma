import { describe, it, expect } from 'vitest';
import { SYSTEM_QUERIES, readSystemAppearance, resolveTheme, type SystemAppearance } from './resolveTheme.js';

const os = (patch: Partial<SystemAppearance> = {}): SystemAppearance => ({ dark: false, moreContrast: false, forcedColors: false, ...patch });

describe('resolveTheme', () => {
  it('follows a light system with Light', () => {
    expect(resolveTheme('system', os())).toBe('light');
  });

  it('follows a dark system with Dark', () => {
    expect(resolveTheme('system', os({ dark: true }))).toBe('dark');
  });

  it('prefers High Contrast when the system asks for more contrast, even when dark', () => {
    expect(resolveTheme('system', os({ moreContrast: true }))).toBe('high-contrast');
    expect(resolveTheme('system', os({ dark: true, moreContrast: true }))).toBe('high-contrast');
  });

  it('uses High Contrast for forced colors', () => {
    expect(resolveTheme('system', os({ forcedColors: true }))).toBe('high-contrast');
  });

  it('ignores the system for an explicit choice', () => {
    expect(resolveTheme('light', os({ dark: true, moreContrast: true }))).toBe('light');
    expect(resolveTheme('dark', os())).toBe('dark');
    expect(resolveTheme('high-contrast', os())).toBe('high-contrast');
  });

  it('reads the system through media queries', () => {
    expect(readSystemAppearance((q) => q === SYSTEM_QUERIES.dark)).toEqual(os({ dark: true }));
    expect(readSystemAppearance(null)).toEqual(os());
    expect(readSystemAppearance(() => { throw new Error('unsupported'); })).toEqual(os());
  });
});
