# Tasks

## 1. Setup

- [x] 1.1 Add `i18next` and `react-i18next` to `client/package.json` and verify `npm --prefix client install` succeeds

## 2. Localizable API errors (server + shared)

- [x] 2.1 Add `ApiErrorCode` and `ApiError` to `shared/types.ts` (design §6) and verify `npm run build:server` type-checks
- [x] 2.2 Add the `apiError(code, error, params?)` helper and switch `bad()`/`notFound()`, `runAlbumChange()` and `currentAlbum()` in `server/src/services/albumApi.ts` to codes and params, keeping status codes and English texts. Verify by extending `albumApi.test.ts`/`routes/albums.test.ts` to assert `code` for the missing name (400), unknown photo/album (404), cover not in album (400), unreadable sidecar (409 with `params.files` and `failedFolders`) and write failure (500)
- [x] 2.3 Switch `photoApi.ts`'s `ApiResult` error body to `ApiError` with codes and verify `photoApi.test.ts` asserts `code` for bad patch (400), unknown photo (404) and unreadable sidecar (409)
- [x] 2.4 Convert the inline errors in `server/src/routes/index.ts` (photo not found, export params, movie photoIds, people name, caught exceptions → `internal`) and verify with a route test that each responds with its `code`

## 3. i18n core (client)

- [x] 3.1 Create `client/src/i18n/languages.ts` with the 11 language tags (native names and directions in `languages.json`, keeping code English-only) and a pure `pickLanguage(remembered, navigatorLanguages)` implementing primary-subtag matching, `zh`→`zh-Hans`, `pt`→`pt-BR` and the English fallback. Verify with `languages.test.ts` covering every scenario in the "Initial language follows the browser" and "Chosen language is remembered" requirements
- [x] 3.2 Create `client/src/i18n/index.ts`: init i18next with eager `en`, lazy `import()` of other catalogs, `fallbackLng: 'en'`, `localStorage` (`paloma.language`) read/write wrapped in try/catch, and typed keys via `CustomTypeOptions`. Verify `npm run build:client` type-checks and a wrong key in a `t()` call fails the build
- [x] 3.3 Add an `I18nProvider` that sets `<html lang dir>` and `document.title` and swaps the Bootstrap LTR/RTL `<link>`. Set the initial link before the first render in `main.tsx`, and remove the static Bootstrap import from `index.css`. Verify manually that switching to `ar` sets `dir="rtl"` and moves the sidebar right, and switching back restores it
- [x] 3.4 Add the `useFormat()` hook (`formatNumber`, `formatDate`, `formatDateTime` over `Intl` with the active language) and verify with a unit test that 1234 formats as `1.234` for `de` and `1,234` for `en`
- [x] 3.5 Add `client/src/api/http.ts` with `apiRequest` and `ApiRequestError`, and an error-message helper (known code → `t('errors.<code>', params)`, else `error`, else `errors.request_failed` with status, plus a translated `errors.not_changed` line for `failedFolders`). Make `client/src/api/albums.ts` use it. Verify with `http.test.ts` covering known code, unknown code and no body

## 4. Externalize UI strings

- [x] 4.1 Write `en.json` and `uk.json` by moving every Ukrainian literal from `Navbar`, `LeftSidebar`, `PhotoTray`, `PhotoCard`, `VirtualPhotoGrid`, `AlbumHeader`, `AlbumPickerModal` and `AlbumPropertiesModal` into keys used with `t()`, with plurals for counts (`photos_one/_few/_many/_other`). Verify that `grep -P '[А-Яа-яІіЇїЄєҐґ]'` finds no matches in these files
- [x] 4.2 Do the same for `App.tsx`, `EditorCanvas`, `CollageBuilder`, `ExportWizardModal`, `PrintModal`, `MovieMakerModal`, `PlacesMap`, `PeopleView` and the page title. Verify that `grep -rP '[А-Яа-яІіЇїЄєҐґ]' client/src client/index.html` finds nothing outside `client/src/i18n/locales/`
- [x] 4.3 Route badge counts through `formatNumber` and verify manually that an album count shows `1.234` in German
- [x] 4.4 Replace physical `left`/`right` in `index.css` and inline styles with logical properties, and add `.flip-rtl` to directional icons. Verify manually in `ar` that the photo tray, star overlay and modals are mirrored correctly

## 5. Language switcher

- [x] 5.1 Add a language dropdown to `Navbar` listing native names from `languages.ts`, with the active one checked. Selecting a language calls `i18n.changeLanguage` and persists the choice. Verify manually that switching keeps the current view, the tray selection and an open album dialog, and that the choice survives a reload

## 6. Translations

- [x] 6.1 Add machine-translated catalogs `zh-Hans`, `es`, `ar`, `pt-BR`, `fr`, `de`, `ja`, `ru`, `id`, `uk` with `"_meta": { "reviewed": false }`, covering every `errors.*` code. Verify with `client/src/i18n/catalogs.test.ts`: each catalog has exactly the English keys (plural suffixes resolved per `Intl.PluralRules` categories), the same `{{placeholders}}` and no empty values
- [x] 6.2 Check the layout in `de`, `ja` and `ar` at a 1280px width, and fix overflowing top-bar and sidebar buttons. Verify manually that no text is clipped or overlaps

## 7. Integration

- [x] 7.1 Clear `paloma.language`, set the browser language to `es-MX`, and verify the UI starts in Spanish. Trigger an album error, such as renaming to an empty name through the API, and verify the Spanish error text is shown
- [x] 7.2 Verify `npm run build` and `npm test` pass
