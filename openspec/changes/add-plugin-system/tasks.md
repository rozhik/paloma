# Tasks

## 1. Config and shared types

- [x] 1.1 Add `PALOMA_PLUGINS_DIR` to `.env.example` (documented, default `<PALOMA_DATA_DIR>/plugins`) and `pluginsDir` / `bundledPluginsDir` to `server/src/config.ts` (bundled resolved from the server source location, not cwd); extend `config.test.ts` to cover the default, a relative and an absolute value
- [x] 1.2 In `shared/types.ts` add `EditStep`, `LocalizedText`, `FilterParamInfo` (number/boolean/choice/rect), `FilterInfo`, `PluginInfo` (id, name, description, version, source, enabled, status, error, warnings, filters); change `Photo.edits` to `EditStep[] | null`; delete `EditDAG` and `PhotoTuning`; verify `npm run build` reports only the expected call sites that still use the removed types
- [x] 1.3 Add `server/src/plugins/api.ts` with the types-only plugin author API (`PluginHost`, `PluginContributions`, `FilterDefinition`, param definitions, `RenderInput`) and a `tsconfig` setup with `allowJs`/`checkJs` for `plugins/**/*.js` included in the server build; verify `npm run build:server` type-checks a JS file under `plugins/` that imports these types via JSDoc

## 2. Plugin discovery, state and registry

- [x] 2.1 Implement manifest reading/validation (`server/src/plugins/manifest.ts`): required fields, id format, localized text with `en`, `apiVersion === 1`, `server` path staying inside the folder; tests in `manifest.test.ts` cover a valid manifest, invalid JSON, missing id, `../` module path and `apiVersion: 2`
- [x] 2.2 Implement discovery of direct subfolders in the bundled and external roots (skip folders without a manifest, missing external root = none), ordering bundled-first then by folder name, and duplicate-id resolution; tests with temp folders cover each case from the "found", "ids are unique" requirements
- [x] 2.3 Implement plugin state in `<PALOMA_DATA_DIR>/plugins.json` (defaults: bundled on, external off; atomic write; unknown/corrupt file falls back to defaults with a log); tests cover defaults, persistence across a reload and a corrupt file
- [x] 2.4 Implement `PluginRegistry`: load enabled plugins via `import()` + `activate(host)`, validate contributions (filters with label/group/params; unknown keys warned), register filters with first-wins name conflicts and warnings, isolate load errors, `setEnabled` (load on switch-on, unregister on switch-off, retry after a load error), `epoch` counter; tests use fixture plugins in temp folders: off plugin's module is never imported (side-effect file not written), throwing module → `error` status while others work, duplicate filter name → warning, switch on/off without restart
- [x] 2.5 Initialize the registry in `server/src/index.ts` before folder scanning and log a one-line summary per plugin; verify by starting the server with an empty external folder and seeing both bundled plugins listed

## 3. Render pipeline

- [x] 3.1 Implement `validateChain(steps, registry)` (D6): shape checks, typed param validation, default fill-in, pass-through for unavailable filters; tests cover every param type, out-of-range, unknown key, `enabled` other than `false`, unavailable filter kept verbatim
- [x] 3.2 Implement `RenderService.render(filePath, steps, { maxSize? })`: EXIF orientation, pre-downscale for previews, per-step raw materialization, skip disabled/unavailable/failing/timed-out steps with a log naming photo and filter; tests with small generated images and fixture filters verify order (crop then rotate ≠ rotate then crop), skipping, failure isolation and output size fitting `maxSize`
- [x] 3.3 Implement effective chain + `renderKey` and `photoImageUrls(photo, edits)` (D7); tests verify key is null without effective steps, changes when a plugin is switched off or its version changes, and stable otherwise
- [x] 3.4 Generalize `ThumbnailService` to write/serve `<fileHash>_<key>_{thumb|preview}.webp` lazily with in-flight de-duplication; test that two concurrent requests render once and that unedited photos keep using the scanner's files

## 4. Bundled plugins

- [x] 4.1 Create `plugins/basic-transforms/` (manifest with name/description in all 11 UI languages; `crop64`, `rotate`, `flip`, `straighten` filters with params per the basic-filters spec, labels in all 11 languages); tests in `plugins/basic-transforms/index.test.ts` render generated images and check the spec scenarios (1000×800 crop → 800×400 region at 100,200; rotate 90 of 4000×3000 → 3000×4000; horizontal flip moves a left marker right; straighten 3° keeps 4:3 and leaves no transparent/blank corners)
- [x] 4.2 Create `plugins/basic-effects/` (`brightness`, `contrast` in `tuning`; `bw`, `sepia` in `effects`; localized texts); tests check brightness 40 raises mean luminance, contrast 0 is a no-op, `bw` yields R=G=B for every pixel, sepia yields a warm monochrome
- [x] 4.3 Write `docs/plugins.md` for plugin authors (folder layout, manifest fields, `activate(host)`, filter/param contract, resolution independence, install via `git clone`/`git submodule add` into `PALOMA_PLUGINS_DIR`, trust warning); verify a copy of the example plugin from the doc loads in a registry test

## 5. Edits in the sidecar and the library

- [x] 5.1 Extend `SidecarService`: `fieldsOf` parses `edits` (array of objects with string `filter`, else ignored), `FieldPatch.edits` (`[]` deletes), keep `edits` out of the Picasa-mapped `SUPPORTED_FIELDS`; extend `SidecarService.test.ts` for the sidecar-files delta scenarios (edits stored with `modified`, wrong type ignored and preserved, edits survive Picasa re-import of an unmodified entry)
- [x] 5.2 Make `FolderScannerService.indexPhoto`/`applyFolderState` write and delete `edits` rows from `PhotoFields.edits`, and add the one-time removal of non-array MVP rows at DB init; extend `FolderScannerService.test.ts` for "Edits rebuilt from disk" and for an outside sidecar edit updating edits without restart
- [x] 5.3 Update `photoApi.toApiPhoto`, `geoApi` and `albumApi` to return `edits` as `EditStep[]` and image URLs from `photoImageUrls`; extend `photoApi.test.ts`, `geoApi.test.ts`, `albumApi.test.ts` to check URLs change when edits are effective

## 6. HTTP API

- [x] 6.1 Add `GET /api/plugins?lang=` and `PATCH /api/plugins/:id` with error codes `plugin_not_found`, `plugin_unavailable`, `plugin_invalid_body`; route tests cover list localization with `en` fallback, switch off/on, 400, 404 and 409
- [x] 6.2 Add `PUT /api/photos/:id/edits` (validate → `updatePhotosFields` → updated photo) and remove `POST /api/photos/:id/edit` and its `.paloma/originals` backup; tests verify save, reset with `[]`, 400 `edits_invalid` with nothing changed, corrupt sidecar → error and unchanged library, and that the photo file and folder listing are unchanged except `.paloma.json`
- [x] 6.3 Add `POST /api/photos/:id/preview` and `GET /api/photos/:id/{thumbnail,preview}?r=` routes; tests verify the 4000×3000 rotate preview at `maxSize` 1200 is 900×1200 and nothing is saved
- [x] 6.4 Replace the ad hoc edit code in `POST /api/export` with `RenderService` at full size before resizing; test that exporting a left-half crop of a generated image yields the left half at full resolution
- [x] 6.5 Add the new error codes to the server's code set and translations to all 11 client catalogs; `catalogs.test.ts` passes

## 7. Client: Plugins view

- [x] 7.1 Add `client/src/api/plugins.ts` (list/switch with `lang`) and a `currentView: 'plugins'` with a Navbar button; verify via `library.test.ts`-style unit test for the API wrapper
- [x] 7.2 Build `PluginsView.tsx`: cards with name, description, version, bundled/external badge, switch, error/warning, the full-access warning for external plugins, localized error on failed switch with state rollback, and `libraryVersion` bump on success; add strings to all 11 catalogs; verify manually that switching `basic-effects` off turns sepia thumbnails back to colour after the grid reloads

## 8. Client: editor

- [x] 8.1 Rewrite `EditorCanvas.tsx` state as chain + undo/redo stacks with the same-filter-merge rule; extract the chain reducer to `client/src/components/editChain.ts` with tests in `editChain.test.ts` (merge consecutive slider changes, rotate ±90 combining and dropping at 0, remove step, undo/redo, reset undoable)
- [x] 8.2 Implement generated controls by param type (large slider, switch, choice buttons, crop frame overlay with ratio presets free/original/1:1/4:3/3:2/16:9 and orientation toggle) grouped Basic/Tuning/Effects from active plugins, plus Rotate left/right and the straighten grid; verify manually in the running app
- [x] 8.3 Implement the server preview (debounce ~150 ms, abort stale requests, `maxSize` from canvas × DPR capped at 2048, preview of preceding steps while a `rect` is edited), hold-for-original, the step list with "unavailable" badges and remove buttons, Save (PUT; stays open with localized error on failure), Cancel and Reset; add strings to all 11 catalogs and drop unused MVP editor keys; verify manually: crop + sepia + save updates the grid thumbnail without reload, and a photo with an unknown `grain` step keeps it after saving another change

## 9. Integration

- [x] 9.1 End-to-end check: clone a sample plugin (the doc example) into `PALOMA_PLUGINS_DIR`, restart, confirm it is listed as off and its module did not run, switch it on, apply its filter in the editor, save, export; then switch it off and confirm the step is kept and skipped
- [x] 9.2 Run `npm run build` and `npm test` from the repo root and verify both pass
