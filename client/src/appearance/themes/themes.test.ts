import { describe, it, expect } from 'vitest';
import { COLOR_TOKENS, type ColorToken } from '../tokens.js';
import { contrast, hexContrast, parseHex } from '../contrast.js';
import { GLASS_BAR_OPACITY, GLASS_PANEL_OPACITY } from '../skins/glass/index.js';
import { THEMES, THEME_IDS, type ThemeId } from './index.js';

/** Text pairs: foreground, background. Text needs 4.5:1 (7:1 in High Contrast). */
const TEXT_PAIRS: [ColorToken, ColorToken][] = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-raised'],
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'surface-raised'],
  ['accent', 'surface'], ['danger', 'surface'], ['success', 'surface'], ['warning', 'surface'], ['info', 'surface'],
  ['accent-text', 'accent'], ['danger-text', 'danger'], ['success-text', 'success'],
  ['warning-text', 'warning'], ['info-text', 'info'],
  ['chrome-text', 'chrome-bg'], ['chrome-muted', 'chrome-bg'], ['chrome-accent', 'chrome-bg'],
  ['viewer-text', 'viewer-bg'],
];

/** Non-text pairs (icons, control borders, focus, selection): 3:1 (4.5:1 in High Contrast). */
const UI_PAIRS: [ColorToken, ColorToken][] = [
  ['border', 'surface'], ['border', 'bg'],
  ['focus', 'bg'], ['focus', 'surface'], ['focus', 'chrome-bg'],
  ['selection', 'surface'], ['selection', 'bg'],
];

/** WCAG AA for every theme; High Contrast must reach AAA. */
const MINIMUMS: Partial<Record<ThemeId, { text: number; ui: number }>> = {
  'high-contrast': { text: 7, ui: 4.5 },
};
const minimum = (id: ThemeId) => MINIMUMS[id] ?? { text: 4.5, ui: 3 };

describe('themes', () => {
  it('registers every theme id', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
  });

  describe.each(THEME_IDS)('%s', (id) => {
    const theme = THEMES[id];

    it('sets exactly the color tokens and nothing else', () => {
      expect(Object.keys(theme).sort()).toEqual(['colors', 'id']);
      expect(Object.keys(theme.colors).sort()).toEqual([...COLOR_TOKENS].sort());
    });

    it('writes every color as hex', () => {
      for (const [token, value] of Object.entries(theme.colors)) expect(parseHex(value), token).not.toBeNull();
    });

    it.each(TEXT_PAIRS)('text %s on %s is readable', (fg, bg) => {
      expect(hexContrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(minimum(id).text);
    });

    it.each(UI_PAIRS)('%s against %s stands out', (fg, bg) => {
      expect(hexContrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(minimum(id).ui);
    });
  });

  // Fluid Glass shows the theme's surface, partly see-through, over photos; the photo can be anything
  describe.each(['light', 'dark'] as const)('Fluid Glass in %s', (id) => {
    const colors = THEMES[id].colors;
    const glass = (opacity: number) => ({ ...parseHex(colors.surface)!, a: opacity / 100 });

    it('keeps text on its bars readable over black and white', () => {
      expect(contrast(parseHex(colors.text)!, glass(GLASS_BAR_OPACITY))).toBeGreaterThanOrEqual(4.5);
    });

    it.each(['text', 'text-muted', 'accent'] as const)('keeps %s on its panels readable over black and white', (token) => {
      expect(contrast(parseHex(colors[token])!, glass(GLASS_PANEL_OPACITY))).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('has no translucent surface in High Contrast', () => {
    // The overlay is a scrim over photos (crop frame, map notes), not a surface
    for (const [token, value] of Object.entries(THEMES['high-contrast'].colors)) {
      if (token !== 'overlay') expect(parseHex(value)!.a, token).toBe(1);
    }
  });
});
