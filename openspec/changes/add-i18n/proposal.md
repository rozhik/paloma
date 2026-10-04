# Proposal

## Why

Paloma's UI is hardcoded in Ukrainian (about 200 strings across `client/src`), while server error messages are hardcoded in English. Only Ukrainian speakers can use the app, and they still see English errors. As a successor to Google Picasa, which shipped in dozens of languages, Paloma needs a real localization layer before the UI grows further and more hardcoded strings pile up.

## What Changes

- Add UI localization with 11 languages: English, Chinese (Simplified), Spanish, Arabic, Portuguese (Brazil), French, German, Japanese, Russian, Indonesian (the top 10 languages of software and the web) plus Ukrainian.
- On first start, pick the language from the browser's preferred languages. Fall back to English when none is supported. **BREAKING** (MVP behavior only): the UI no longer defaults to Ukrainian.
- Add a language switcher in the top bar. It lists each language by its own name. The choice persists across reloads.
- Move every UI string out of the components into per-language message catalogs. English is the reference catalog, and a missing key falls back to English.
- Use the active language's plural rules for counts. Format dates and numbers with the active language.
- Support right-to-left layout for Arabic: set `dir="rtl"`, use Bootstrap's RTL stylesheet and mirror direction-dependent styles.
- Set the document's `lang` attribute and translate the page title.
- API error responses gain a stable machine-readable `code` and optional `params`, next to the existing English `error` text. The client shows the translated message for a known code and falls back to `error` otherwise.
- User content (album names, captions, keywords, folder and file names) and server logs are never translated.

## Capabilities

### New Capabilities
- `localization`: UI language selection, detection and persistence, the supported language set, the English fallback, plural and date/number formatting, right-to-left layout, and localizable API error responses (`code` + `params`).

### Modified Capabilities
<!-- None: the albums and sidecar-files specs require that "the API SHALL respond with an error" and that "a failed request SHALL show its error"; both still hold. The error body format is defined by the new localization capability. -->

## Impact

- **Client**: every component in `client/src/components/`, `App.tsx`, `client/src/api/albums.ts` and `client/index.html`. New `client/src/i18n/` module with 11 catalogs. New dependencies `i18next` and `react-i18next`. Bootstrap's RTL CSS is loaded conditionally.
- **Server**: error responses in `server/src/routes/index.ts` and `server/src/services/albumApi.ts` gain `code`/`params`. Status codes and English texts stay the same.
- **Shared**: a new `ApiError` type and error-code union in `shared/types.ts`.
- **Translations**: English is the source; all 10 other catalogs, Ukrainian included, start as machine translations, which native speakers should review later. Source code contains only English: translated texts and the languages' own names live in JSON data files.
