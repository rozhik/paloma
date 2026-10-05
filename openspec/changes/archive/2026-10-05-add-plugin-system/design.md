# Design

## Context

See proposal.md for why plugins are needed. Requirements are in `specs/plugins`, `specs/photo-edits`, `specs/basic-filters` and the `specs/sidecar-files` delta.

Current MVP state that shapes the approach:

- **Editor**: `client/src/components/EditorCanvas.tsx` draws the full original on a canvas and applies CSS canvas filters (`contrast`, `brightness`, `sepia`, `grayscale`) plus a straighten rotation. Crop is only an outline.
- **Save**: the editor posts an `EditDAG` object (`crop` `[x,y,w,h]` in pixels, `straighten`, `tuning`) to `POST /api/photos/:id/edit`. That route stores it in the SQLite `edits` table and copies the original to `<folder>/.paloma/originals/`.
- **Export**: `POST /api/export` has its own `if` chain over `EditDAG` (sharp `extract`, `rotate`, `linear`, `grayscale`). It does not match the preview, because sharp applies operations in a fixed order, not the order they were called.
- **Thumbnails and previews**: `ThumbnailService` writes `<cacheDir>/<fileHash>_thumb.webp` and `_preview.webp` from the original with EXIF orientation applied. URLs are built in three places: `photoApi.toApiPhoto`, `geoApi` and `albumApi`.
- **Sidecar**: `SidecarService` owns `.paloma.json`. It parses entries through `fieldsOf()`, writes changes through `updatePhotosFields()` and `FieldPatch`, and re-imports Picasa `.ini` fields listed in `SUPPORTED_FIELDS`. `FolderScannerService.applyFolderState()` copies the parsed fields into SQLite, and the watcher re-applies them when the sidecar changes.
- **Config**: `server/src/config.ts` reads `.env`, and data lives in `PALOMA_DATA_DIR`.

## Goals / Non-Goals

**Goals:**
- One render path on the server, used for thumbnails, previews, the editor preview and export, so every view of a photo agrees.
- A plugin contract small enough to keep stable (`apiVersion: 1`), and open to new kinds of contributions later without a breaking change.
- Bundled filters use exactly the same contract as third-party ones.

**Non-Goals:**
- Sandboxing plugin code. Plugins are trusted, and the risk is handled by off-by-default external plugins and a warning (see Risks).
- Client-side plugin modules and instant on-device previews.
- Cleaning up stale rendered thumbnails in the cache (see Open Questions).
- Applying edits in Movie Maker, collages or printing. Those keep using the plain previews, as in the MVP.

## Decisions

### D1. Two plugin roots, one format
- **Bundled plugins**: `plugins/<id>/` at the repo root, committed. The server finds this folder relative to its own source (`config.bundledPluginsDir`), so it does not depend on the working directory.
- **External plugins**: `PALOMA_PLUGINS_DIR` from `.env`, defaulting to `<PALOMA_DATA_DIR>/plugins`. That default sits outside the repo and inside an already git-ignored folder. The user installs a plugin with `git clone` or `git submodule add` into that folder. A plugin that needs npm packages ships them, or documents `npm install` in its own folder.
- *Alternative*: one shared `plugins/` folder for both. Rejected: user clones would sit in Paloma's working tree, and it would be unclear which plugins are bundled.

### D2. Manifest plus an ESM module with `activate(host)`
`paloma-plugin.json` holds identity only: `id`, `name`, `description`, `version`, `apiVersion` and `server`. This lets Paloma list a plugin and show its name, description and errors without running its code, which is what makes "off means not loaded" possible.

The server module is plain JavaScript (ESM), loaded with `import(pathToFileURL(path))`. Paloma has no build step for plugins. It exports:

```js
export async function activate(host) {
  return { filters: [ /* FilterDefinition */ ] };
}
```

- `host` gives `apiVersion`, `sharp` (the host's instance, so plugins don't need their own sharp and versions can't clash) and a `log` that adds the plugin id as a prefix.
- The returned object is the plugin's contributions. `filters` is the only key in API v1, and other keys are ignored with a warning. Later extension points, such as `mapProvider`, become new keys and new `host` methods, gated by `apiVersion`.
- *Alternatives*: declarative JSON filters, rejected by the user (they can't add algorithms). Filters listed in the manifest with a code reference, rejected because two places would describe one filter.

**Bundled plugins** are written as `.js` with `// @ts-check` and JSDoc types imported from `server/src/plugins/api.ts`, the types-only plugin API. That way tsx in dev and the `tsc` production build load them exactly like external plugins, and `npm run build` still type-checks them. That needs `allowJs` and `checkJs` scoped to `plugins/` in a small tsconfig included in the build.

### D3. Filter contract and render steps
A filter definition is:

```js
{
  name, label, group,
  params: [ { name, label, type, ...typeFields } ],
  async render({ image, width, height, params, host }) { /* returns a sharp instance */ },
}
```

- **Param types**: `number` (`min`, `max`, `step`, `default`), `boolean` (`default`), `choice` (`options: [{ value, label }]`, where a value is a string or number, plus `default`) and `rect` (`default` `{left, top, right, bottom}` in 0..1).
- **Step isolation**: the render service applies EXIF orientation, then for each step it hands the filter a fresh `sharp(rawRGBA, { raw })` of the current pixels. It then materializes the result with `.raw().toBuffer({ resolveWithObject: true })` before the next step. This keeps the chain's order exact, which a single sharp pipeline can't do, and the plugin still uses sharp's fast operations.
- **Resolution independence**: filters get `width` and `height` and must express sizes as fractions of them. For previews and thumbnails the service downscales first, to the requested size times 1.5 with a minimum of 400 px, and then runs the chain. Export runs the chain at full resolution.
- **Errors**: a step that throws or returns something that isn't a sharp instance is skipped, and the error is logged with the photo path and the filter name.
- *Alternative*: filters working on raw `Uint8Array` pixels. Rejected as the only interface because loops in JS are slow, but a filter can still do this through `image.raw()`.

### D4. Registry and plugin state
`PluginRegistry`, under `server/src/plugins/`, builds the plugin list at startup:

- **Discovery order**: bundled plugins first, then external plugins by folder name. Duplicate ids and filter names lose to whatever came first.
- **Load**: `load(id)` calls `activate`, checks the contributions against the v1 schema, and registers the filters.
- **Switch**: `setEnabled(id, on)` writes the state, then loads or unregisters.
- **Unloading**: Node can't unload an ES module. Switching off unregisters the plugin's filters, and the module stays in memory until restart. Switching on again reuses the loaded module and calls `activate` again.
- **State file**: `<PALOMA_DATA_DIR>/plugins.json`, `{ "plugins": { "<id>": { "enabled": true|false } } }`, written atomically (temp file and rename). When an id has no entry, the default is on for bundled plugins and off for external ones. The file is app state, not photo data, so it does not go into SQLite, which is rebuildable from disk.
- **Change counter**: the registry raises an `epoch` number on every switch. The client refetches plugins and photos after a switch, and render keys (D7) change by themselves.

### D5. Edits in the sidecar and the library
- **Type**: `EditStep = { filter: string; enabled?: false; [param: string]: unknown }` in `shared/types.ts`. `Photo.edits` becomes `EditStep[]`, and `EditDAG` and `PhotoTuning` are deleted.
- **Parsing**: `SidecarService.fieldsOf()` reads `edits` only when it is an array of plain objects that each have a string `filter`. Otherwise it ignores it, and the file keeps it as for any field of the wrong type.
- **Writing**: `FieldPatch.edits` (`[]` deletes the key) goes through the existing `updatePhotosFields()`. Saving edits therefore gets atomic writes, `modified`, Picasa import on the first change, and the unreadable-sidecar refusal with no new code.
- **Picasa re-import**: `edits` is **not** added to `SUPPORTED_FIELDS`, the Picasa-mapped list that re-import clears on unmodified entries. A hand-written `edits` in an entry imported from Picasa therefore survives a re-import. Picasa `filters=` stays ignored.
- **Library**: the SQLite `edits` table is reused. `edit_instructions_json` now holds the `EditStep[]` JSON, with one row per photo that has edits. `applyFolderState()` and `indexPhoto()` insert, update or delete the row from `PhotoFields.edits`.
- **MVP rows**: on startup a one-time migration deletes `edits` rows whose JSON is not an array. Those rows hold MVP `EditDAG` data that was never in a sidecar, so they are dropped, as the proposal says.

**Files in photo folders.** Paloma reads `.paloma.json`, the Picasa `.ini` (only for the import on the first change, as today) and the photo file, read-only, for rendering. It writes only `.paloma.json`, atomically through the existing temp-file-and-rename. It no longer creates `.paloma/originals/`. Folders that already exist from the MVP are left untouched.

### D6. Validation is generic
`validateChain(steps, registry)` lives on the server and is used by `PUT /edits` and `POST /preview`:

- Each step must be an object with a string `filter`, and `enabled` may only be `false`.
- For an **available** filter: unknown keys are rejected, `number` values must be in range (step is not enforced, to avoid float rounding issues), `choice` values must be one of the options, and a `rect` must be within 0..1 with `left < right` and `top < bottom`. Missing params are filled in with their defaults before saving.
- For an **unavailable** filter, the step is passed through untouched.

### D7. Rendered thumbnails keyed by the effective chain
- **Effective chain**: a photo's steps that would actually render (enabled, and the filter is available), each tagged with its plugin's `id@version`.
- **Render key**: `renderKey = sha1(JSON(effective chain)).slice(0, 12)`, or `null` when the effective chain is empty.
- **No edits**: when `renderKey` is `null`, URLs stay `/api/cache/thumbnail/<fileHash>` and `/api/cache/preview/<fileHash>`, and the files the scanner already makes are reused.
- **With edits**: URLs are `/api/photos/:id/thumbnail?r=<key>` and `/api/photos/:id/preview?r=<key>`. On a cache miss, the route renders `<cacheDir>/<fileHash>_<key>_{thumb|preview}.webp` lazily and serves it with long-lived caching. A new key means a new URL, so browser caching is safe.
- **Shared helper**: `photoImageUrls(photo, edits)` builds both URLs and is used by `toApiPhoto`, `geoApi` and `albumApi`. The geo and album queries join `edits`.
- **Why it works**: switching a plugin changes the effective chain, so the next photo list gives new URLs and nothing has to re-render in bulk. Updating a plugin's version, which needs a restart, also changes keys.
- **Concurrent requests**: requests for the same uncached key share one in-flight render promise.
- *Alternative*: re-rendering every affected thumbnail when edits are saved or a plugin is switched. Rejected: switching a plugin could re-render thousands of files, and the lazy approach gives the same result on demand.

### D8. Server-rendered editor preview
The editor previews through `POST /api/photos/:id/preview` (`{ edits, maxSize }` → WebP):

- **Timing**: requests are debounced by about 150 ms, and a newer one aborts the older one with `AbortController`.
- **Size**: `maxSize` is the canvas box size times `devicePixelRatio`, capped at 2048.
- **Rect parameters**: while a `rect` parameter is being edited, for example the crop frame, the editor previews the steps *before* that step and draws the frame as a client-side overlay in fractions of that image. The other steps are applied again when the frame is confirmed.
- **Why server-side**: one implementation per filter, and the preview is exactly what export gives. The cost is about 100–300 ms from slider to preview, which suits the large, calm controls of the senior-friendly UI.
- *Alternative*: client-side preview modules shipped by each plugin. Deferred, because it needs client module loading, which is out of scope, and each filter would need two implementations that could drift apart.

### D9. Editor and Plugins view
- **Editor**: `EditorCanvas.tsx` is rewritten, and its state is the chain plus undo and redo stacks of chains.
  - **Controls**: generated from `GET /api/plugins` (active filters) by param type, in Basic, Tuning and Effects sections.
  - **Merging**: changing a filter's control updates the last step if it is the same filter, otherwise it appends a step.
  - **Quick actions**: the editor has a few actions keyed by bundled filter names. "Rotate left/right" adds ±90 to the trailing `rotate` step and drops it at 0. A straighten grid overlay appears while `straighten` is changing. Ratio presets show for `crop64`'s `rect`. When those filters aren't available, the actions are hidden. A generic UI-hint mechanism isn't worth adding for three cases.
  - **Step list**: shows each step's label, or `filter` with an "unavailable" badge, and a remove button.
- **Plugins view**: a new `currentView: 'plugins'` with a Navbar button. It uses TanStack Query on `GET /api/plugins?lang=` and `PATCH`, and on success it bumps `libraryVersion` so photos refetch.
- **Strings**: all new UI strings go into the 11 locale catalogs. Plugin-supplied texts resolve on the server by `lang`, falling back to `en`.

### D10. API errors
New error codes are added to the fixed set: `plugin_not_found`, `plugin_unavailable` (409), `plugin_invalid_body`, `edits_invalid` (with `params.filter` / `params.param`) and `render_failed`. Each has translations in the client catalogs, as the localization spec requires.

### MVP code: reused, rewritten, dropped
- **Reused**: `SidecarService` (extended with `edits`), `FolderScannerService` (`applyFolderState`/`indexPhoto` handle edits), the `edits` table (meaning changed), `ThumbnailService` (generalized to render through the chain), `apiError`, `normalizeLang`, the store's `libraryVersion` refresh pattern and the Navbar pattern.
- **Rewritten**: `EditorCanvas.tsx`, the edit handling in the `POST /api/export` loop (now the render service), and the thumbnail and preview URL building in `photoApi`, `geoApi` and `albumApi`.
- **Dropped**: `POST /api/photos/:id/edit`, the `.paloma/originals/` backup, the `EditDAG`/`PhotoTuning` types, and the MVP editor's i18n keys that no longer apply.

## Risks / Trade-offs

- **[Plugin code runs with full server rights]**: a malicious or buggy external plugin can read or delete files. → External plugins are off until switched on, and the Plugins view and the docs say plainly that they run with full access. Disabled plugins are never imported.
- **[A plugin hangs or is very slow]**: one filter can block rendering. → Each render step gets a timeout (10 s preview, 60 s export). A timeout counts as a failure, so the step is skipped and logged. sharp work runs off the main thread, but plugin JS doesn't, which is a known limit.
- **[Memory at full resolution]**: materializing raw RGBA between steps costs about 48 MB per step for a 12 MP photo. → Only one step's buffers live at a time, and export processes photos one by one, as today.
- **[Preview latency]**: the server round-trip is slower than a canvas filter. → Debounce, abort, and a preview size that matches the screen. Client-side previews remain a later option (D8).
- **[Switching off changes how photos look]**: the user might think edits are lost. → The steps stay in the sidecar, and the editor shows them as unavailable. Switching the plugin back on restores the look.
- **[Name clashes with future Picasa import]**: Paloma's `rotate`/`flip`/`straighten` filters may differ from Picasa's `rotate=`/`flipped=`/`tilt`. → Paloma names avoid Picasa's names where the semantics are unconfirmed (`straighten`, not `tilt`). `crop64`, `bw` and `sepia` reuse Picasa's names because their meaning matches docs/picassa/08.
- **[Cache growth]**: every distinct chain leaves rendered files. → Accepted for now (see Open Questions).

## Migration Plan

1. Deploy. On first start, MVP `edits` rows that aren't arrays are deleted (D5), and the bundled plugins are on by default.
2. Existing `.paloma/originals/` folders in photo folders are not touched. Users can delete them by hand.
3. Rollback: the previous build ignores `edits` in `.paloma.json`, which is unknown content it preserves, and `plugins.json`. Photos then appear unedited, and nothing on disk is lost.

## Open Questions

- When and how to evict rendered thumbnails for chains that are no longer used, for example on startup by removing `_<key>_` files not referenced by any photo.
- Whether to publish a template repository (`paloma-plugin-template`) for third-party authors. Writing plugin author docs in `docs/` is part of this change.
