	# Design

## Context

- About 200 Ukrainian strings are hardcoded across `client/src/App.tsx`, the 16 components in `client/src/components/` and `client/src/api/albums.ts`. `client/index.html` hardcodes `lang="uk"` and a Ukrainian `<title>`.
- The client has no localization library and no client-side tests. The root `npm test` (vitest, no config) picks up every `*.test.ts` in the repo, client included.
- Server errors are English strings, built in three places. `albumApi.ts` uses `bad()`, `notFound()`, `runAlbumChange()` and `currentAlbum()`. `photoApi.ts` returns its own `ApiResult` error bodies. `routes/index.ts` has inline `res.status(...).json({ error })` calls for photos, export, movie and people. `client/src/api/albums.ts` throws `data.error` and appends `failedFolders`.
- Styling is Bootstrap 5, imported from `client/src/index.css`, plus about 17 physical-direction usages (`ms-*`/`me-*`, `border-end`, `left`/`right`).
- No files in the user's photo folders are read or written by this change.

## Goals / Non-Goals

**Goals:**
- One translation mechanism for every UI string, with typed keys so a typo fails `npm run build`.
- Adding a 12th language means adding one catalog file and one entry in the language list.
- A test fails when a catalog drifts from the English reference.

**Non-Goals:**
- Translating server logs, user content, or metadata written to sidecars.
- Server-side language negotiation (`Accept-Language`). The server stays language-neutral.
- Locale-aware sorting of albums and folders. The server keeps its current `localeCompare` behavior.
- Professional translation review. The catalogs ship as machine translations.

## Decisions

### 1. `i18next` + `react-i18next`
Use `i18next` with `react-i18next` (`useTranslation`, `<Trans>` for strings with inline markup). It covers fallback language, interpolation, plurals through `Intl.PluralRules` (`_one`/`_few`/`_many`/`_other` suffixes), and re-rendering on language change.
- *Alternative: a hand-rolled `t()` over JSON + `Intl.PluralRules`.* It has fewer dependencies, but we would reimplement fallback, interpolation escaping and React re-render wiring.
- *Alternative: `react-intl` (ICU MessageFormat).* It is more expressive, but ICU syntax is heavier for translators and the bundle is larger. We need nothing beyond plurals.

### 2. Catalog layout and loading
`client/src/i18n/locales/<tag>.json`, one flat-namespaced JSON per language (`nav.library`, `album.delete.confirm`, `errors.album_name_required`, …). `en.json` is the reference. `languages.ts` lists the 11 language tags in the order the spec's switcher scenario gives, and reads each language's `nativeName` and `dir` from `languages.json`, so source code holds only English. Non-English catalogs are lazy-loaded with dynamic `import()` so each language is its own Vite chunk. English is bundled eagerly as the fallback. A TypeScript declaration (`i18next` `CustomTypeOptions.resources`) types the keys from `en.json`.

### 3. Language detection and persistence
A small own module instead of `i18next-browser-languagedetector`, because the matching rules are specific (primary subtag, `zh` → `zh-Hans`, `pt` → `pt-BR`) and easy to unit-test as a pure function `pickLanguage(remembered, navigatorLanguages)`. The choice is stored in `localStorage` under `paloma.language`. Every access is wrapped in try/catch, and a failed read behaves as "nothing remembered".
- *Alternative: store it on the server (a settings table or `.env`).* Paloma has no user settings yet, and a per-browser choice is enough for a local app. This can be revisited when settings exist.

### 4. Document `lang`, `dir`, title and RTL
On every language change, a `useEffect` in the i18n provider sets `document.documentElement.lang`, `.dir` and `document.title`. For RTL, the static `@import 'bootstrap/dist/css/bootstrap.min.css'` in `index.css` is removed. `main.tsx` imports both `bootstrap.min.css?url` and `bootstrap.rtl.min.css?url`, and the provider swaps a single `<link id="bootstrap-css">` href by direction. The RTL build mirrors utilities (`ms-*`, `border-end`, `text-start`), so markup classes stay unchanged. The few custom styles that use physical `left`/`right` in `index.css` or inline styles become logical properties (`inset-inline-start`, `margin-inline-end`). Directional icons, such as chevrons and arrows from lucide, get a `.flip-rtl` class (`[dir=rtl] .flip-rtl { transform: scaleX(-1) }`).
- *Alternative: always load LTR CSS and override with `[dir=rtl]` rules.* That means many manual overrides, which break silently.

### 5. Dates and numbers
A `useFormat()` hook returns `formatDate`, `formatDateTime` and `formatNumber`, built on `Intl.DateTimeFormat`/`NumberFormat` with `i18n.language`. Counts in badges and any dates the current UI shows go through it. The UI shows almost no dates today, and this change does not add new date displays.

### 6. API error codes
`shared/types.ts` gains:
```ts
export type ApiErrorCode =
  | 'invalid_body' | 'invalid_field' | 'album_name_required' | 'photo_ids_required'
  | 'no_album_fields' | 'no_photo_fields' | 'photo_not_found' | 'album_not_found' | 'file_not_found'
  | 'cover_not_in_album' | 'sidecar_unreadable' | 'sidecar_write_failed' | 'album_empty'
  | 'export_params_required' | 'person_name_required' | 'internal';
export interface ApiError { error: string; code: ApiErrorCode; params?: Record<string, string | number>; failedFolders?: string[] }
```
A server helper `apiError(code, error, params?)` builds the body. `bad()`/`notFound()` in `albumApi.ts` take a code, `photoApi.ts`'s `ApiResult` error body becomes `ApiError`, and the inline route errors use the helper. Media endpoints (`/cache/*`, `/raw/*`) answer a missing file with `file_not_found`, and an Express error handler turns malformed JSON into `invalid_body` (400) and any uncaught error into `internal` (500). Field-type errors use `invalid_field` with `params.field`. Lists such as sidecar files and folders are joined into one `params.files`/`params.folders` string so translations interpolate them directly. The English `error` texts stay as they are. The client's `albumRequest` becomes a generic `apiRequest` in `client/src/api/http.ts`. It throws an `ApiRequestError` carrying the body, and a `useErrorMessage()` helper renders `t('errors.' + code, params)` if the key exists in the English catalog, else `error`, else `t('errors.request_failed', { status })`. The `failedFolders` suffix becomes a translated `errors.not_changed` line.
- *Alternative: the server localizes messages using `Accept-Language`.* It would need catalogs on both sides and couple the API to UI language. Codes keep the server neutral.

### MVP code: reused, rewritten, dropped
- **Reused**: all components and their layout. Only string literals are replaced with `t()` calls. The `albumApi.ts`/`photoApi.ts` result types and status codes, plus the English error texts as `error`.
- **Rewritten**: `client/src/api/albums.ts` error handling (moves to `http.ts`), the error-body construction in `albumApi.ts`, `photoApi.ts` and `routes/index.ts`, the Bootstrap CSS import in `index.css`/`main.tsx`, and `client/index.html` (`lang`/title set at runtime, English default in the static HTML).
- **Dropped**: the hardcoded Ukrainian strings in the components, and the Ukrainian default in `index.html`.

## Risks / Trade-offs

- [Machine translations may be awkward or wrong] → English is the source. Every other catalog, Ukrainian included, carries `"_meta": { "reviewed": false }` so reviewers can track it. User content is never affected.
- [Catalogs drift as new UI strings are added] → `catalogs.test.ts` checks that every catalog has exactly the English key set, accounting for each language's plural suffixes from `Intl.PluralRules`, and that `{{placeholders}}` match.
- [Longer strings (German) or CJK fonts break the large-button layout] → Manual pass over the top bar and sidebar in `de`, `ja` and `ar`. Buttons get `text-wrap`/`min-width: 0` where they overflow.
- [RTL stylesheet swap flashes unstyled content] → Set the initial `<link>` before React renders, from the same `pickLanguage` result, so only a later manual switch swaps it.
- [Dynamic `import()` of a catalog fails offline or in dev] → Fall back to English and log the error to the console.

## Migration Plan

No data migration. Existing users who relied on the Ukrainian default get Ukrainian automatically if their browser prefers `uk`. Otherwise they pick it once in the switcher. API clients that only read `error` are unaffected, because the new fields are additive. Rollback is reverting the change.

## Open Questions

- Should the language choice later move into a server-side settings store, shared across browsers? This is deferred until Paloma has settings. It does not change this design.
