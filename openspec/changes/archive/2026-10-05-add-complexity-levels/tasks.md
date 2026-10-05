# Tasks

## 0. Prerequisite

- [x] 0.1 Make sure `add-skins-and-themes` is archived (its `openspec/specs/skins` and `themes` exist); verify `openspec list` no longer shows it as an active change

## 1. Levels core

- [x] 1.1 Add `ComplexityLevel` to `shared/types.ts`, and `client/src/levels/levels.ts` with `LEVELS` and `atLeast()` (D1), plus `levels.test.ts` covering the order and that `developer` allows every level; verify `npm test` passes
- [x] 1.2 Add `levels/sha256.ts` (pure TS) with tests against the NIST vectors (`""`, `"abc"`, the 448-bit message), and `levels/pin.ts` with `isValidPin` (4–8 digits), `hashPin(pin, salt)` and `checkPin`, with tests that a stored PIN record never contains the digits; verify `npm test` passes
- [x] 1.3 Extend `uiSettings.ts` with `level` (default `normal`), `pin` (default `null`) and `slideshowInterval` (3/5/10, default 5), validated per field, plus `normalizeLevel` making `child` without a valid `pin` read as `normal` (D4); extend `uiSettings.test.ts` with unknown level, child without PIN, an old stored object without the fields, and an invalid interval; verify `npm test` passes
- [x] 1.4 Add `levels/controls.ts` with `ControlId`, the `CONTROL_LEVELS` table from D2, and `useLevel()` and `useAllows()`; add `controls.test.ts` asserting that every `NAV_ITEMS` view, `TRAY_ACTION_IDS` entry and `SIDEBAR_LISTS` entry has a table entry, and spot-checking the D2 table (e.g. `tray.export` is `easy`, `view.map` is `normal`, `slideshow` is `child`); verify `npm test` passes

## 2. Filtering the shared UI

- [x] 2.1 Filter `useNavigationItems()`, `useTray().actions` and `useSidebarSections()` by level (D2); extend `shell.test.ts` so that at `child` the nav has only library and settings, the sidebar has only albums and the tray has no actions, and at `easy` the tray has addToAlbum/removeFromAlbum/makeCover/clear/export/print only; verify `npm test` passes
- [x] 2.2 Make `SquarePhotoCard` drop the checkbox, star, Ctrl/Cmd+click and Space selection when `photo.select` and `photo.star` are not allowed, and keep click/Enter to open; verify in the browser at Child that a Ctrl-click selects nothing and cards open the viewer
- [x] 2.3 Hide search and the top-bar language switcher by level in the Classic, Compact and Fluid Glass shells; extend `skins.test.tsx` to render each skin's `AppShell` at `child` and `normal` and assert which nav items, sidebar headings, search and language switcher are present; verify `npm test` passes
- [x] 2.4 Hide `AlbumHeader` Edit properties and Delete below Normal, and the map's place-photos and remove-location controls below Normal; verify in the browser at Easy that an album shows name and description without those buttons
- [x] 2.5 Pass `editBar: null` to `ViewerChrome` and ignore edit shortcuts in the viewer when `viewer.editBar` is not allowed; verify in the browser at Child that the viewer shows navigation and zoom only and no key opens a filter panel
- [x] 2.6 At Child, make `useLibraryPhotos()` return no photos when no album is selected, and show a "Choose an album" empty state in the library; verify in the browser that switching to Child while a folder is shown displays that message, and choosing an album shows its photos
- [x] 2.7 Add `enterChildMode()` (clear tray selection, folder and filter, close the export, print and movie dialogs) (D5) with a store-level test that the selection and folder are cleared and the album stays; verify `npm test` passes

## 3. Plugin levels (server)

- [x] 3.1 Read and validate the optional manifest `level` in `server/src/plugins/manifest.ts` (default `normal`, invalid → manifest error naming the allowed levels); extend `manifest.test.ts` with missing, valid and `expert`; verify `npm test` passes
- [x] 3.2 Add `level?` to `FilterDefinition` in `api.ts`; in `registry.ts` compute each filter's effective level, drop filters with an invalid level and add a warning naming them, and add `level` to `PluginInfo` and `FilterInfo`; extend `registry.test.ts` (filter inherits the plugin level, own level wins, invalid level → warning and the other filters still work); verify `npm test` passes
- [x] 3.3 Set `"level": "easy"` in `plugins/basic-effects/paloma-plugin.json`; add an API test that `GET /api/plugins` reports `basic-effects` and its filters as `easy` and `basic-transforms` as `normal`; verify `npm test` passes
- [x] 3.4 Document `level` for manifests and filters in `docs/plugins.md` (allowed values, default, inheritance, that it only shapes the UI) and use it in the docs example; verify `docsExample.test.ts` passes

## 4. Plugin levels (client)

- [x] 4.1 Filter the edit bar's filters by `atLeast(level, plugin.level) && atLeast(level, filter.level)`, leaving the edit chain and rendering untouched (D3); add a unit test for the filter function; verify `npm test` passes, and in the browser at Easy that the edit bar offers brightness, contrast, B&W and sepia but no crop/rotate/flip/straighten, and a cropped photo still shows cropped

## 5. PIN lock and Settings

- [x] 5.1 Implement `usePinGate` (unlocked, failures, 30 s wait after 5 failures) with unit tests using fake timers for the wait, the reset after a correct PIN, and relocking when leaving Settings; verify `npm test` passes
- [x] 5.2 Implement `PinDialog` (modes unlock, create and change; numeric input; errors for too-short and mismatched entries and for a wrong PIN; countdown) and route the Settings nav item through it at Child; make `App.tsx` render `SettingsView` only when unlocked at Child (D5); verify in the browser that Settings at Child asks for the PIN, a wrong PIN keeps it closed, and going back to the library and returning asks again
- [x] 5.3 Restructure `SettingsView.tsx`: a Language section first (native names, active marked, `changeLanguage`), a Level section second (five choices with name and description, Child → create PIN, leaving Child → clears PIN, Change PIN at Child), then Appearance and Viewer (D7); verify in the browser the order, that choosing Easy updates the navigation at once while Settings stays open, and that Child survives a reload
- [x] 5.4 Add the new strings (level names and descriptions, including that Child is a convenience lock; Language and Level section titles; PIN dialog texts and errors; "Choose an album"; slideshow controls and interval) to all 11 locale files; verify `catalogs.test.ts` passes

## 6. Slideshow

- [x] 6.1 Add a pure `slideshowReducer` (start index, play/pause, next/prev with wrap, tick, interval change) with `slideshow.test.ts`, and `startSlideshow`/`stopSlideshow` in `usePalomaStore`; verify `npm test` passes
- [x] 6.2 Implement `Slideshow.tsx` (D8): full-window overlay, edited preview fitted on a dark background, preloading the next photo, full-screen request with fallback, controls auto-hiding after 3 s, keys Space/←/→/Esc with RTL swap, exit on leaving full screen, interval stored in `uiSettings`; render it from `App.tsx`; verify in the browser in English and Arabic that it advances, wraps, pauses, and exits back to the same album and selection
- [x] 6.3 Add `SlideshowButton` to `AlbumHeader` and to each skin's library area for folders, shown only when the grid has photos and starting from the first selected photo; extend `skins.test.tsx` to assert the button has an accessible name in each skin; verify `npm test` passes and the button works at Child, Easy and Normal in the browser

## 7. Documentation

- [x] 7.1 Write `docs/complexity-levels.md`: what each level shows (the D2 table in plain words), how the Child PIN works and its limits (browser-only, cleared with site data), and how to tag a new control or plugin; link it from `AGENTS.md` (Layout → `docs/`); verify the links resolve and the table matches `controls.ts`

## 8. Integration check

- [x] 8.1 Walk each level (Child, Easy, Normal, Developer) in each skin in the browser: navigation, sidebar, grid card controls, tray, album header, viewer edit bar, map, slideshow and Settings; verify that what is shown matches `docs/complexity-levels.md`
- [x] 8.2 Verify `npm run build` and `npm test` pass
