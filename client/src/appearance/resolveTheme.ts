import type { ThemeChoice } from '../settings/uiSettings.js';
import type { ThemeId } from './themes/types.js';

/** What the operating system asks for, as the browser reports it through media queries. */
export interface SystemAppearance {
  /** `prefers-color-scheme: dark` */
  dark: boolean;
  /** `prefers-contrast: more` */
  moreContrast: boolean;
  /** `forced-colors: active` (e.g. Windows contrast themes) */
  forcedColors: boolean;
}

/** The media queries behind {@link SystemAppearance}. */
export const SYSTEM_QUERIES: Record<keyof SystemAppearance, string> = {
  dark: '(prefers-color-scheme: dark)',
  moreContrast: '(prefers-contrast: more)',
  forcedColors: '(forced-colors: active)',
};

/** The theme to show: the chosen one, or for `system` High Contrast, then Dark, then Light. */
export function resolveTheme(choice: ThemeChoice, system: SystemAppearance): ThemeId {
  if (choice !== 'system') return choice;
  if (system.moreContrast || system.forcedColors) return 'high-contrast';
  return system.dark ? 'dark' : 'light';
}

/** The system appearance now; all false where media queries are not available. */
export function readSystemAppearance(match: ((query: string) => boolean) | null = browserMatch()): SystemAppearance {
  const read = (query: string) => {
    try {
      return match ? match(query) : false;
    } catch {
      return false;
    }
  };
  return { dark: read(SYSTEM_QUERIES.dark), moreContrast: read(SYSTEM_QUERIES.moreContrast), forcedColors: read(SYSTEM_QUERIES.forcedColors) };
}

function browserMatch(): ((query: string) => boolean) | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? (query) => window.matchMedia(query).matches
    : null;
}
