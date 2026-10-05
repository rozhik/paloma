import { light } from './light.js';
import { dark } from './dark.js';
import { highContrast } from './highContrast.js';
import type { Theme, ThemeId } from './types.js';

export { THEME_IDS, type Theme, type ThemeId } from './types.js';

/** The built-in themes, in the order Settings offers them. */
export const THEMES: Record<ThemeId, Theme> = { light, dark, 'high-contrast': highContrast };
