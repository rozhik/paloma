# Proposal

## Why

Paloma's editor is hard-coded in the MVP. A few sliders in `EditorCanvas.tsx` and a matching `if` chain in the export route each implement the same operations, and edits live only in SQLite, so they never travel with the folder. To grow the set of image operations without touching the core, and to let people share operations in their own git repositories, Paloma needs a plugin system. Image transformations are the first thing plugins provide. Later, plugins should also be able to replace system parts, such as the map provider. That is out of scope here, but the plugin format must leave room for it.

## What Changes

- **Plugins**: a plugin is a folder with a `paloma-plugin.json` manifest that gives an id, a name, a description (both optionally per language), a version and a plugin API version, plus a trusted JavaScript (ESM) server module.
  - Paloma discovers plugins at startup in two places: bundled plugins committed in the repo's `plugins/` folder, and external plugins in a folder set in `.env` (`PALOMA_PLUGINS_DIR`). An external plugin is installed by `git clone` or `git submodule add` into that folder. Paloma itself never runs git.
- **Switching plugins on and off**: each plugin can be switched on and off in a new Plugins settings view. The choice is kept in the data directory. Bundled plugins start on. A newly found external plugin starts off, because its code is trusted JavaScript, and its module is not loaded until the user switches it on.
  - A plugin that fails to load shows its error and does not affect the other plugins.
- **Filters**: a plugin contributes filters. A filter has a name that is unique across plugins, a localized label, a group (basic, tuning, effects), a list of typed parameters (number, boolean, choice, rectangle) and a render function on the server that transforms the image.
  - Parameters are resolution-independent, so the same chain renders a thumbnail, the editor preview and a full-size export.
- **Non-destructive edits in the sidecar**: a photo's edits become an ordered chain of `{ "filter": …, …params }` steps, stored as `edits` in its `.paloma.json` entry and rebuilt into the library from disk. The photo file is never written.
  - A step whose filter is missing or switched off is kept in the file and skipped when rendering, and the editor shows it as unavailable.
  - **BREAKING** (MVP only): the SQLite-only `EditDAG` object (`crop`, `straighten`, `tuning`) is dropped. The MVP backup copy to `.paloma/originals/` is dropped too.
- **Rendering**: thumbnails, previews, the editor preview and export all render the photo through its enabled edit chain on the server. Switching a plugin on or off changes how affected photos look, and their thumbnails are re-rendered.
- **Editor**: the editor is rebuilt around the filters of the enabled plugins. It generates controls from the parameter types, previews through the server, and offers undo/redo, hold-for-original, reset to original and save.
- **Bundled plugins**: two plugins replace the MVP editor operations.
  - `basic-transforms`: crop, rotate by 90°, flip, straighten.
  - `basic-effects`: brightness, contrast, black & white, sepia.
- **Out of scope**: extension points other than filters (map provider, views, menus), client-side plugin modules, installing or updating plugins from the UI, hot-loading plugins added while the server runs, importing Picasa `filters=` / `rotate=` into `edits`, and baking edits into files. The manifest's `apiVersion` and the module's export object are designed to leave room for these.

## Capabilities

### New Capabilities
- `plugins`: plugin folders and manifest, discovery of bundled and external plugins, switching plugins on and off, load errors, the plugins API and the Plugins settings view.
- `photo-edits`: a photo's non-destructive edit chain made of plugin filters, how it is validated, saved and rendered (thumbnails, previews, export), and the editor that builds it.
- `basic-filters`: the filters shipped in the bundled plugins (crop, rotate, flip, straighten, brightness, contrast, black & white, sepia) and their parameters.

### Modified Capabilities
- `sidecar-files`: photo entries gain an `edits` field, which is preserved and rebuilt into the library like the other fields. Picasa `filters=` stays ignored.

## Impact

- **Server**:
  - new plugin loader/registry, render pipeline and plugin and edit endpoints (`GET /api/plugins`, `PATCH /api/plugins/:id`, `PUT /api/photos/:id/edits`, `POST /api/photos/:id/preview`).
  - `SidecarService` and the scanner gain `edits`, and `ThumbnailService` renders edits.
  - The MVP `POST /api/photos/:id/edit` route and the export route's ad hoc edit code are replaced.
- **Client**: `EditorCanvas.tsx` is rewritten, and a Plugins view is added to the navbar. Strings are added to all 11 locale catalogs.
- **Shared**: `shared/types.ts` gets plugin, filter and edit-step types, and drops `EditDAG` and `PhotoTuning`.
- **Config**: a new `PALOMA_PLUGINS_DIR` setting in `.env.example`. Plugin on/off state is stored in `<PALOMA_DATA_DIR>/plugins.json`.
- **Repo**: a new top-level `plugins/` folder with the two bundled plugins.
- **Security**: external plugins run with the server's full rights. This is documented, and the plugins are off until the user turns them on.
