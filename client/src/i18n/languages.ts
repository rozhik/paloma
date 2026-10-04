import languageData from './languages.json';

/** A UI language: its BCP 47 tag, its name in itself, and its text direction. */
export interface Language {
  tag: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

// Each language's name in itself is data, kept in languages.json; the list order is the switcher order
const TAGS = ['en', 'zh-Hans', 'es', 'ar', 'pt-BR', 'fr', 'de', 'ja', 'ru', 'id', 'uk'] as const;

export type LanguageTag = (typeof TAGS)[number];

export const LANGUAGES: readonly (Language & { tag: LanguageTag })[] = TAGS.map((tag) => {
  const entry = (languageData as Language[]).find((language) => language.tag === tag);
  if (!entry) throw new Error(`languages.json has no entry for ${tag}`);
  return { ...entry, tag };
});

export const FALLBACK_LANGUAGE: LanguageTag = 'en';

/** Key under which the language chosen in the switcher is kept in `localStorage`. */
export const LANGUAGE_STORAGE_KEY = 'paloma.language';

export function isLanguageTag(value: unknown): value is LanguageTag {
  return LANGUAGES.some((language) => language.tag === value);
}

export function languageOf(tag: LanguageTag): Language {
  return LANGUAGES.find((language) => language.tag === tag)!;
}

/** The supported language for a browser language tag, compared by primary subtag (`es-MX` -> `es`, `zh-TW` -> `zh-Hans`). */
export function matchLanguage(browserTag: string): LanguageTag | undefined {
  const primary = browserTag.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((language) => language.tag.toLowerCase().split('-')[0] === primary)?.tag;
}

/**
 * The UI language: the remembered choice if it is supported, else the first of the browser's preferred languages
 * that is supported, else English.
 */
export function pickLanguage(remembered: string | null | undefined, browserLanguages: readonly string[]): LanguageTag {
  if (isLanguageTag(remembered)) return remembered;
  for (const tag of browserLanguages) {
    const match = matchLanguage(tag);
    if (match) return match;
  }
  return FALLBACK_LANGUAGE;
}
