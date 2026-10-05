/**
 * Names of the design tokens. Each token is the CSS custom property `--pal-<name>` on `<html>`.
 * These lists are the single source of truth: themes, skins, the generated CSS and the token reference in
 * `docs/skins-and-themes.md` are all checked against them.
 */

/** Colors. Every theme sets all of them; a skin's default colors fill in what a theme leaves out. */
export const COLOR_TOKENS = [
  'bg', 'surface', 'surface-raised', 'text', 'text-muted', 'border',
  'accent', 'accent-text', 'selection', 'star',
  'danger', 'danger-text', 'success', 'success-text', 'warning', 'warning-text', 'info', 'info-text',
  'focus', 'chrome-bg', 'chrome-text', 'chrome-muted', 'chrome-accent',
  'viewer-bg', 'viewer-text', 'overlay', 'placeholder',
] as const;

/** Element sizes. Only skins set them. */
export const SIZE_TOKENS = [
  'font-size', 'font-size-small', 'font-size-large', 'icon-size',
  'control-padding-y', 'control-padding-x', 'hit-min', 'radius', 'radius-large', 'gap',
  'thumb-size', 'tray-height', 'viewer-bar-size', 'sidebar-width',
] as const;

/** Fonts. Only skins set them. */
export const FONT_TOKENS = ['font-family', 'font-weight-strong', 'line-height'] as const;

export type ColorToken = typeof COLOR_TOKENS[number];
export type SizeToken = typeof SIZE_TOKENS[number];
export type FontToken = typeof FONT_TOKENS[number];
export type Token = ColorToken | SizeToken | FontToken;

/** The CSS custom property of a token. */
export const cssVar = (token: string) => `--pal-${token}`;
