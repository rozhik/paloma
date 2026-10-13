# Tasks

## 1. Shared catalog, presets and validation

- [x] 1.1 Add `ActionId`, `KeySectionId`, `KeyChord`, `StoredKeymap`, `KeymapFile`, `KeymapPresetId`/`KeymapPresetInfo` (and API response) types to `shared/types.ts`; verify `npm run build` type-checks client and server
- [x] 1.2 Audit the library, viewer, edit bar, slideshow, People, Map and Collage screens for buttons that are the only one of their kind or act on the selection/shown photo, and record the confirmed action ids and bundled filter ids in `shared/keymaps.ts` (`SECTIONS` with scope groups, `ACTIONS` with section and control id); verify every listed control id exists in `CONTROL_LEVELS`
- [x] 1.3 Add the `mac`, `windows` and `tvBox` presets to `shared/keymaps.ts` per design §6; add `shared/keymaps.test.ts` checking that `mac` and `windows` bind every built-in action, `tvBox` uses only remote keys without modifiers, no preset has a scope conflict, and `windows` keeps today's viewer/slideshow/card keys
- [x] 1.4 Implement `chordOf(event)` and chord normalization (fixed modifier order, `Space`, upper-case letters, `code` fallback with Alt/Meta, Shift dropped for symbols); verify with unit tests including `⌥1` on macOS and `+` vs `Shift+=`
- [x] 1.5 Implement `resolveKeymap(preset, bindings)` and `validateKeymap(input)` (format marker, version, name 1–64, known preset, valid chords, scope conflicts on the resolved keymap naming both actions, unknown ids dropped and reported, uninstalled plugin filter ids kept, file → overrides conversion); verify with unit tests for each spec scenario of "Invalid keymaps are refused" and "Keys are unique within their scope"

## 2. Server storage and API

- [x] 2.1 Add the `keymaps` table to `server/src/db/schema.ts` and an idempotent `createKeymapTables` in `server/src/db/columns.ts`, called at start; verify in `columns.test.ts` that running it twice keeps rows
- [x] 2.2 Add `server/src/services/keymapApi.ts` (get/save per owner, `'~single'` with auth off) and delete the row in `deleteUser`'s transaction; verify with a test that deleting a user removes their keymap and leaves others'
- [x] 2.3 Add `server/src/routes/keymap.ts` with `GET /api/keymap`, `PUT /api/keymap` (256 KB body limit) and `GET /api/keymap/presets`, all `need('authenticated')`, registered in `routes/index.ts`; verify `routes/keymap.test.ts` covers: null before saving, save and read back, users isolated, Viewer role may save, API token may read, 400 `invalid_keymap` with conflicting actions named, dropped ids reported, stored keymap unchanged after a refused PUT, auth-off single user; verify `guards.test.ts` passes
- [x] 2.4 Write `docs/keybindings.md` (what a keymap is, presets, levels, JSON format with an example, API routes) and link it from `AGENTS.md` and `docs/users-and-auth.md`; verify the example JSON passes `validateKeymap` in a test

## 3. Client keymap and dispatcher

- [x] 3.1 Add `client/src/keys/keymapStore.ts` (a zustand store, as the rest of the client uses no TanStack Query): `GET /api/keymap` per user, device default (`mac` on Apple platforms, else `windows`) when null or on error, resolved with the installed plugin filters, and save/choose-preset/reset mutations with optimistic update and rollback; verify with unit tests for the default and the fallback on a failed request
- [x] 3.2 Add `KeyDispatcher` and `useKeyActions(section, handlers)` in `client/src/keys/` implementing design §5 (typing guard incl. Esc offered first, dialogs allow only Global, RTL arrow mirroring, `useAllows` + `enabled()` check, `preventDefault` only when an action runs, suspend while capturing); verify with tests for typing `i` in a field, Esc in a field, a hidden control below its level, a missing permission, an empty selection, Arabic `←`, and a Viewer key outside the viewer
- [x] 3.3 Add `keys.section.*` and `keys.action.*` translations for every catalog action and section in all bundled locales (English text as the fallback where a translation is missing); verify a test that every `ACTIONS` id and `SECTIONS` id has an English name

## 4. Moving existing keys to the keymap

- [x] 4.1 Replace the `keydown` handler in `usePhotoViewer.ts` with `useKeyActions('viewer' | 'edit', …)` for close, previous/next, info, faces, objects, star, zoom, pan, undo, show original and the bundled filters; drop `isInfoKey` and `isFacesKey` and their tests; verify the existing viewer tests (Esc with an open panel, typing in the tag field) pass through the dispatcher
- [x] 4.2 Replace the `keydown` handler in `Slideshow.tsx` with `useKeyActions('slideshow', …)`; verify slideshow tests for Space, arrows (incl. RTL) and Esc
- [x] 4.3 Route card Enter/Space in `SquarePhotoCard.tsx` and `ClassicPhotoCard.tsx` through `library.open`/`library.toggleSelect`, and add `library.focus*` arrow navigation between cards in the grid; verify with a component test that Enter opens the viewer and arrows move focus
- [x] 4.4 Register Global, Library, Selection, People, Map and Collage actions in their screens (navigation views, search, select all, slideshow, tray actions via `useTray()`, people/map/collage buttons); verify with tests that `S` stars the selection, `A` opens Add to album, and `Alt+3` does nothing at Easy

## 5. Settings and Keybindings page

- [x] 5.1 Add control ids `settings.keyboard` (normal), `view.keybindings` (normal) and `keybindings.importExport` (pro) to `client/src/levels/controls.ts` and update `docs/complexity-levels.md`; verify `controls.test.ts` and `levels.test.ts` pass
- [x] 5.2 Add the Keyboard section to the Settings view (after the viewer bars): keymap name, based-on preset, preset choice with confirmation when the keymap has overrides, Edit keys button; verify component tests for choosing `tvBox`, the confirm/cancel path and that Easy shows no section
- [x] 5.3 Add the `keybindings` view (`AppView`), reachable only from Settings, in every skin: editable name, filter by action name or key, sections in catalog order with key chips, remove key, Add key capture (records Esc, Cancel ends), conflict alert with Move here/Cancel, reset action, reset all, back to Settings, error shown and last saved keys kept on a failed save; verify component tests for each "Edit keys" and "Keybindings page" scenario
- [x] 5.4 Add Download and Upload (Professional and up): download the resolved keymap as `<name>.paloma-keys.json`, upload with 256 KB limit, client-side validation, confirmation, and a message listing dropped ids; verify tests that download→upload round-trips the same keys, that Normal shows neither button, and that a `.paloma.json` upload is refused with the keymap unchanged
- [x] 5.5 Add warnings in Add key capture for browser-reserved chords (`Ctrl+W`, `Ctrl+T`, `Ctrl+N`, `Meta+Q`, `Meta+W`); verify with a unit test

## 6. Integration

- [x] 6.1 Run the app with users on, log in as two users in two browsers, change a key for one, and confirm it applies in that user's other browser and not for the other user; with users off confirm the single user's keymap persists across restarts
- [x] 6.2 Run `openspec validate add-keybindings --strict`, `npm run build` and `npm test`, and verify all pass
