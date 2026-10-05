import { COLOR_TOKENS, FONT_TOKENS, SIZE_TOKENS, cssVar, type ColorToken, type FontToken, type SizeToken } from './tokens.js';
import { luminance, parseHex, rgbTriple } from './contrast.js';
import type { Theme } from './themes/types.js';

/** The token values a skin sets: all sizes and fonts, and colors used where the theme sets none. */
export interface SkinTokens {
  sizes: Record<SizeToken, string>;
  fonts: Record<FontToken, string>;
  /**
   * Default colors: any color token, plus colors only this skin uses (e.g. `glass-tint`). A skin's own colors
   * should be derived from theme tokens (`color-mix(in srgb, var(--pal-surface) 70%, transparent)`), so they
   * follow every theme.
   */
  defaultColors: Partial<Record<ColorToken, string>> & Record<string, string>;
}

/** Whether a theme is dark, from the luminance of its background. */
export function isDarkTheme(theme: Theme): boolean {
  const bg = parseHex(theme.colors.bg);
  return bg !== null && luminance(bg) < 0.2;
}

/** Bootstrap's variables, fed from the tokens so its components follow the skin and theme. */
function bootstrapVariables(theme: Theme): [string, string][] {
  const v = (token: ColorToken | SizeToken | FontToken) => `var(${cssVar(token)})`;
  const vars: [string, string][] = [
    ['--bs-body-bg', v('bg')],
    ['--bs-body-color', v('text')],
    ['--bs-emphasis-color', v('text')],
    ['--bs-secondary-color', v('text-muted')],
    ['--bs-tertiary-color', v('text-muted')],
    ['--bs-secondary-bg', v('surface-raised')],
    ['--bs-tertiary-bg', v('bg')],
    ['--bs-border-color', v('border')],
    ['--bs-border-color-translucent', v('border')],
    ['--bs-link-color', v('accent')],
    ['--bs-link-hover-color', v('accent')],
    ['--bs-focus-ring-color', `color-mix(in srgb, ${v('focus')} 60%, transparent)`],
    ['--bs-font-sans-serif', v('font-family')],
    ['--bs-body-font-family', v('font-family')],
    ['--bs-body-font-size', v('font-size')],
    ['--bs-body-line-height', v('line-height')],
    ['--bs-border-radius', v('radius')],
    ['--bs-border-radius-lg', v('radius-large')],
  ];
  const named: [string, ColorToken][] = [
    ['primary', 'accent'], ['danger', 'danger'], ['success', 'success'], ['warning', 'warning'], ['info', 'info'],
  ];
  for (const [name, token] of named) {
    vars.push([`--bs-${name}`, v(token)]);
    const rgb = rgbTriple(theme.colors[token]);
    if (rgb) vars.push([`--bs-${name}-rgb`, rgb]);
  }
  const linkRgb = rgbTriple(theme.colors.accent);
  if (linkRgb) vars.push(['--bs-link-color-rgb', linkRgb], ['--bs-link-hover-color-rgb', linkRgb]);
  return vars;
}

/** All token values of a skin and theme, by CSS property name. Theme colors win over the skin's defaults. */
export function appearanceVariables(skin: SkinTokens, theme: Theme): Map<string, string> {
  const vars = new Map<string, string>();
  for (const [token, value] of Object.entries(skin.defaultColors)) vars.set(cssVar(token), value);
  // Only color tokens are read from a theme, whatever else the object holds
  for (const token of COLOR_TOKENS) vars.set(cssVar(token), theme.colors[token]);
  for (const token of SIZE_TOKENS) vars.set(cssVar(token), skin.sizes[token]);
  for (const token of FONT_TOKENS) vars.set(cssVar(token), skin.fonts[token]);
  for (const [name, value] of bootstrapVariables(theme)) vars.set(name, value);
  return vars;
}

/**
 * One CSS rule that sets every token on `<html>`. `html:root` outranks Bootstrap's `[data-bs-theme]` rules,
 * which would otherwise reset its variables.
 */
export function buildAppearanceCss(skin: SkinTokens, theme: Theme): string {
  const lines = [...appearanceVariables(skin, theme)].map(([name, value]) => `  ${name}: ${value};`);
  lines.push(`  color-scheme: ${isDarkTheme(theme) ? 'dark' : 'light'};`);
  return `html:root {\n${lines.join('\n')}\n}\n`;
}
