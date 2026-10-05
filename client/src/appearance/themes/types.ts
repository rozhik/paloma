import type { ColorToken } from '../tokens.js';

export const THEME_IDS = ['light', 'dark', 'high-contrast'] as const;
export type ThemeId = typeof THEME_IDS[number];

/** A theme: colors only, one hex value for every color token. */
export interface Theme {
  id: ThemeId;
  colors: Record<ColorToken, string>;
}
