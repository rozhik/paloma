import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import {
  FALLBACK_LANGUAGE, LANGUAGE_STORAGE_KEY, isLanguageTag, languageOf, pickLanguage, type LanguageTag,
} from './languages.js';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

// English is bundled as the fallback; every other catalog is its own chunk, loaded when chosen
const loaders = import.meta.glob<Record<string, unknown>>(['./locales/*.json', '!./locales/en.json'], { import: 'default' });

function readRemembered(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(tag: LanguageTag): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, tag);
  } catch {
    // Not remembered (storage blocked); the language still applies until reload
  }
}

/** Loads a language's catalog unless it is already loaded; false when it could not be loaded. */
async function loadCatalog(tag: LanguageTag): Promise<boolean> {
  if (i18n.hasResourceBundle(tag, 'translation')) return true;
  const load = loaders[`./locales/${tag}.json`];
  if (!load) return false;
  try {
    i18n.addResourceBundle(tag, 'translation', await load());
    return true;
  } catch (err) {
    console.error(`Failed to load the ${tag} translations:`, err);
    return false;
  }
}

/** Switches the UI language, falling back to English if its catalog cannot be loaded. */
export async function changeLanguage(tag: LanguageTag, { persist = true } = {}): Promise<void> {
  const loaded = await loadCatalog(tag);
  await i18n.changeLanguage(loaded ? tag : FALLBACK_LANGUAGE);
  if (persist) remember(tag);
}

/** The language the UI starts in: the remembered choice, else the browser's preferences, else English. */
export function initialLanguage(): LanguageTag {
  return pickLanguage(readRemembered(), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
}

export async function initI18n(tag: LanguageTag): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    lng: FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });
  await changeLanguage(tag, { persist: false });
}

/** The active UI language. */
export function currentLanguage(): LanguageTag {
  return isLanguageTag(i18n.language) ? i18n.language : FALLBACK_LANGUAGE;
}

export { i18n, languageOf };
