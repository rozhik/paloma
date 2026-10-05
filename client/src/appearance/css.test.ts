import { describe, it, expect } from 'vitest';
import { FONT_TOKENS, SIZE_TOKENS } from './tokens.js';
import { appearanceVariables, buildAppearanceCss, isDarkTheme, type SkinTokens } from './css.js';
import { THEMES } from './themes/index.js';

const sizes = Object.fromEntries(SIZE_TOKENS.map((t) => [t, `${t}-size`])) as SkinTokens['sizes'];
const fonts = Object.fromEntries(FONT_TOKENS.map((t) => [t, `${t}-font`])) as SkinTokens['fonts'];
const skin: SkinTokens = { sizes, fonts, defaultColors: { 'bg': '#123456', 'glass-tint': 'color-mix(in srgb, var(--pal-surface) 60%, transparent)' } };

describe('appearance CSS', () => {
  it('lets theme colors win over the skin defaults', () => {
    const vars = appearanceVariables(skin, THEMES.dark);
    expect(vars.get('--pal-bg')).toBe(THEMES.dark.colors.bg);
  });

  it('keeps colors only the skin sets', () => {
    expect(appearanceVariables(skin, THEMES.light).get('--pal-glass-tint')).toContain('color-mix');
  });

  it('takes sizes and fonts only from the skin', () => {
    const sneaky = { ...THEMES.light, colors: { ...THEMES.light.colors, 'font-size': '99px' } } as typeof THEMES.light;
    const vars = appearanceVariables(skin, sneaky);
    expect(vars.get('--pal-font-size')).toBe('font-size-size');
    expect(vars.get('--pal-font-family')).toBe('font-family-font');
    for (const token of SIZE_TOKENS) expect(vars.get(`--pal-${token}`)).toBe(`${token}-size`);
  });

  it('feeds Bootstrap from the tokens', () => {
    const vars = appearanceVariables(skin, THEMES.light);
    expect(vars.get('--bs-body-bg')).toBe('var(--pal-bg)');
    expect(vars.get('--bs-primary')).toBe('var(--pal-accent)');
    expect(vars.get('--bs-primary-rgb')).toBe('11, 94, 215');
  });

  it('writes one rule for html with the color scheme', () => {
    const css = buildAppearanceCss(skin, THEMES.dark);
    expect(css.startsWith('html:root {')).toBe(true);
    expect(css).toContain('color-scheme: dark;');
    expect(buildAppearanceCss(skin, THEMES.light)).toContain('color-scheme: light;');
  });

  it('knows which themes are dark', () => {
    expect([isDarkTheme(THEMES.light), isDarkTheme(THEMES.dark), isDarkTheme(THEMES['high-contrast'])]).toEqual([false, true, true]);
  });
});
