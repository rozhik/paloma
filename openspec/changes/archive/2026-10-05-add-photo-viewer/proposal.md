# Proposal

## Why

Today a photo opens only on double-click, into a separate editor that is split between a preview and a wide tool column. The photo cannot be zoomed or panned, the user cannot step to the next photo, and nothing is saved until Save is pressed. Paloma needs one full-screen place to look at photos and fix them, as Picasa had. The photo fills the screen, controls float above it, and edits are kept without a separate save step.

## What Changes

- **Opening from the grid**: a plain click on a photo card opens the photo viewer. The card's corner controls keep their own actions. A new select checkbox sits in the top-start corner and the star stays in the top-end corner. Ctrl/Cmd+click toggles selection.
  - **BREAKING** (MVP only): a plain click no longer selects, and double-click no longer opens the editor.
- **Photo viewer screen**: the photo fills the screen behind every control. All controls are overlay panels on top of the photo.
  - The user can zoom (wheel, pinch, keyboard, buttons) and pan by dragging when zoomed. When zoomed in, the photo is shown in more detail.
- **Navigation bar** (overlay): Close, Previous and Next, plus the file name, the position in the list ("3 / 120") and zoom controls. Previous and Next step through the photos of the current grid in grid order. Keyboard: Esc, ←/→, +/−, 0.
- **Edit bar** (overlay): a strip of icon buttons with tooltips. Undo comes first, then Rotate left/right, the filters of the active plugins grouped as Basic, Tuning and Effects, then Show original (hold) and Changes (a read-only step list).
  - A filter with parameters opens a small floating panel with its generated controls, next to the bar.
  - Crop shows its frame over the photo, and its ratio and Apply/Cancel controls in that panel.
- **Auto-save** replaces Save/Cancel: every finished change to a photo's chain is saved to its sidecar right away. Undo is a change too and is also saved.
  - The edit list is the history, as Picasa's `filters=`: Undo removes the last step, so every step can be undone at any time, including after a restart and steps imported from Picasa.
  - **BREAKING** (MVP editor only): there is no Redo and no Revert to original, and steps in the middle of the list can no longer be changed or removed.
  - If saving fails, the viewer shows the error and does not leave the photo until the user retries or discards the unsaved change.
  - **BREAKING** (MVP editor only): the Save and Cancel buttons are removed.
- **Filter icons**: a plugin filter may declare an SVG icon file in its plugin folder. The plugins API returns its URL, and filters without one get a generic icon. The bundled filters ship icons.
- **Settings view**: a new Settings view in the navbar lets the user place the navigation bar and the edit bar on the top, bottom, left or right edge of the screen. The choice is remembered in this browser. Defaults: navigation bar on top, edit bar on the left.
- **Out of scope**: slideshow, auto-hiding overlays, side-by-side before/after, captions/tags/star editing inside the viewer, video, and syncing settings between browsers.

## Capabilities

### New Capabilities
- `photo-viewer`: the full-screen viewer, including opening it, the photo behind overlays, zoom and pan, the navigation bar (close, previous, next), keyboard use, and where the overlay bars are placed.
- `photo-grid`: how a photo card in the library grid responds to the user (click opens the viewer, corner checkbox and Ctrl/Cmd+click select, star).
- `app-settings`: the Settings view and the per-browser UI preferences it holds, starting with the positions of the viewer's bars.

### Modified Capabilities
- `photo-edits`: the editor becomes the viewer's edit bar. Filters are icon buttons with tooltips and floating parameter panels, Undo comes first and removes the last step, changes are auto-saved instead of Save/Cancel, and Reset, Redo and editing of middle steps are dropped. The preview API also reports the full-size dimensions.
- `plugins`: a filter may declare an icon, and the plugins API returns its URL.
- `basic-filters`: the bundled filters have icons.
- `sidecar-files`: Picasa `filters=` is imported into `edits` (crop64, bw and sepia as bundled filters; the others kept with their parameters), so Picasa edits can be undone too.

## Impact

- **Builds on `add-plugin-system`** (archived): it modifies the `photo-edits`, `plugins` and `basic-filters` specs that change created.
- **Client**:
  - New viewer components replace `EditorCanvas.tsx`, reusing its chain reducer, preview hook and crop overlay.
  - `PhotoCard.tsx` changes its click handling, and a Settings view is added to the Navbar.
  - `usePalomaStore` holds the viewer's photo list and index instead of only `activeEditPhoto`.
  - Strings are added to all 11 locale catalogs.
- **Server**:
  - The filter contract gains an optional `icon`, and `GET /api/plugins` returns `iconUrl`.
  - A new route serves a filter's icon from its plugin folder.
  - The bundled plugins get SVG icon files.
  - `POST /api/photos/:id/preview` also reports the full-size width and height of the rendered photo, which zoom percentages need.
- **Server, Picasa import**: `picasaIni` parses `filters=` into an edit chain, and `edits` joins the Picasa-mapped fields that are re-imported for unmodified entries.
- **Shared**: `FilterInfo` gains `iconUrl`.
- **Photo folders**: only `.paloma.json` is written, as before. Folders with Picasa edits now show those edits in Paloma. No new `.env` settings.
