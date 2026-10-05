# Design

## Context

See proposal.md for why this change is needed. Requirements are in `specs/photo-viewer`, `specs/photo-grid`, `specs/app-settings` and the `photo-edits`, `plugins` and `basic-filters` deltas. Those three deltas modify the specs created by the archived `add-plugin-system` change.

Current state that shapes the approach:

- **Grid**: `PhotoCard.tsx` toggles selection on click and opens the editor on double-click through `setActiveEditPhoto`. The star is in the top-end corner, and a check icon appears top-start only when the photo is selected. `VirtualPhotoGrid` gets the `photos` list from `App`, which fetches it for the current folder, album, filter and search.
- **Store**: `usePalomaStore` has `currentView: 'editor'` plus `activeEditPhoto`. `App` returns `<EditorCanvas>` early, so the library unmounts and the grid's scroll position is lost.
- **Editor**: `EditorCanvas.tsx` (447 lines) has a fixed two-column layout, explicit Save/Cancel, and filter controls generated from `GET /api/plugins`. It reuses:
  - `editChain.ts`: a pure reducer with undo/redo and `commit` merging, with tests (reduced to undo only, D11).
  - `useEditPreview.ts`: server preview with debounce, abort, a small cache and the last image kept while loading. The client caps it at 2048 px.
  - `CropOverlay.tsx` and `cropFrame.ts`: frame and ratio maths, with tests.
- **Preview API**: `renderApi.renderPreview` renders at a working size derived from `maxSize` (server cap 4096) and returns WebP only. It does not report the full-size dimensions.
- **Plugins**: `contributions.ts` validates filter definitions (`name`, `label`, `group`, `params`, `render`). `FilterInfo` carries no icon.
- **Preferences**: the only per-browser preference today is the UI language, kept in `localStorage` by `i18n/index.ts` with try/catch.

## Goals / Non-Goals

**Goals:**
- The viewer replaces the editor. There is one screen, and editing is always available on it.
- Zoom, pan and bar layout are pure functions with unit tests. Components stay thin.
- No new runtime dependency.

**Non-Goals:**
- Tiled or progressive full-resolution display above 4096 px. Beyond that, the image is scaled up.
- Prefetching the neighbouring photos' previews. This can be added later without spec changes.
- Reworking Movie Maker, collage, map or tray interactions.

## Decisions

### D1. The viewer is an overlay over a mounted library
The store replaces `activeEditPhoto` with `viewer: { photos: Photo[]; index: number } | null`, with actions `openViewer(photos, index)`, `moveViewer(delta)`, `replaceViewerPhoto(photo)` and `closeViewer()`. The `'editor'` view is removed from `AppView`.

- **Rendering**: `App` renders `<PhotoViewer>` as a `position: fixed; inset: 0` layer with a z-index above the navbar and tray. The library stays mounted underneath, so grid scroll, folder, album, filter, search and selection are kept for free.
- **List snapshot**: `photos` is the grid's list at the time of opening. A background poll that changes the grid does not move the viewer. After each save, the server's updated photo replaces its entry through `replaceViewerPhoto`, so the viewer uses the new `previewUrl`.
- **Grid refresh**: when the viewer closes after at least one save, it calls `bumpLibrary()` once, so the grid shows new thumbnails.
- *Alternative*: keep the early return in `App`. Rejected because the grid's scroll position would be lost on every close.

### D2. Component layout
New folder `client/src/components/viewer/`:

| File | Role |
|---|---|
| `PhotoViewer.tsx` | Shell. Reads settings, places the bars (D5), handles viewer keys (D7), owns the save gate (D4) |
| `ZoomStage.tsx` | Draws the photo with a CSS transform, handles wheel, pointer, pinch and double-click, and shows `CropOverlay`/`StraightenGrid` when the zoom is locked |
| `NavBar.tsx` | Close, Previous, Next, file name, `n / N`, zoom −, %, +, Fit |
| `EditBar.tsx` | Icon buttons in the order from the spec, with tooltips (React Bootstrap `OverlayTrigger`) and `aria-label` |
| `FilterPanel.tsx` | The floating panel next to the bar. It holds the generated parameter controls moved out of `EditorCanvas`, the frame ratio and Apply/Cancel controls, and the Changes list |
| `FilterIcon.tsx` | Draws `iconUrl` as a CSS mask in `currentColor`, or falls back to Lucide `SlidersHorizontal` |
| `zoomMath.ts` | Pure zoom and pan maths (D3), with tests |
| `barLayout.ts` | Pure bar placement (D5), with tests |
| `useViewerEdits.ts` | Per-photo chains and auto-save (D4). Its queue logic is in `saveQueue.ts`, with tests |

`EditorCanvas.tsx` is deleted. `editChain.ts`, `useEditPreview.ts`, `CropOverlay.tsx` and `cropFrame.ts` are reused. The `previewSizeFor` cap rises from 2048 to 4096, matching the server.

### D3. Zoom and pan as a transform over one preview image
- **State**: `{ scale, x, y }`, where `scale` is screen CSS pixels per *full-size* photo pixel (100% = 1) and `x, y` is the offset of the image centre from the stage centre.
- **Fit**: `min(stageW / fullW, stageH / fullH, 1)` (no upscaling for small photos). The minimum is `fit` and the maximum is `4`.
- **Zoom at a point**: the new offset keeps the photo point under the pointer fixed: `p' = anchor − (anchor − p) × newScale / scale`. Then `clampPan` limits the offset per axis to `max(0, (fullW × scale − stageW) / 2)`, which centres the photo on an axis where it fits.
- **Input**:
  - Wheel zooms by a factor `exp(−deltaY × k)`. Pinch on a trackpad arrives as wheel events with `ctrlKey`.
  - Touch pinch uses two tracked pointers.
  - Drag uses Pointer Events with pointer capture.
  - Double-click toggles between fit and 1.
  - Buttons and `+`/`−` zoom by ×1.25 around the centre.
- **Window resize**: if the photo was fitted, it is fitted again. Otherwise the scale is kept and the offset is clamped again.
- **Moving to another photo**: the zoom resets to fit.
- **Frame mode**: while a `rect` parameter is edited, the stage ignores input and the photo is fitted into the area the bars leave free (`barInsets`), so no frame handle hides under a bar.
- *Alternative*: `react-zoom-pan-pinch`. Rejected because limits are relative to actual pixels (which needs our full-size dimensions anyway), the frame-mode lock and RTL handling would have to fight the library, and the maths is about 80 lines.

### D4. Per-photo histories and auto-save
- **Sessions**: `useViewerEdits` keeps `Map<photoId, { chain: ChainState; saved: EditStep[]; status: 'saved' | 'saving' | 'failed'; error }>` for the photos shown since the viewer opened, each starting from `photo.edits`. The edit list is the history (D11), so nothing else has to be loaded.
- **When to save**: after every reducer action except an in-progress slider change. Slider `onChange` dispatches `apply`/`update` without saving. `pointerup`/`keyup`/`blur` dispatch `commit`, and the save is scheduled then. In all cases a save is enqueued when `chain.steps` differs from `saved`, so no-op commits do not hit the server.
- **Queue** (`saveQueue.ts`): one in-flight `PUT /api/photos/:id/edits` per photo. A change made while a save is in flight sets a "pending" flag, and the latest steps are sent when the current save finishes. This avoids out-of-order writes to `.paloma.json`. On success, `saved` is updated, and the returned photo goes to `replaceViewerPhoto` and `refreshSelectedPhotos`.
- **Save gate**: Close, Previous and Next first await the current photo's queue.
  - If the queue ends `failed`, they do not leave the photo, and an alert shows the localized error with "Try again" (re-enqueue) and "Discard change".
  - Discard restores the last saved steps.
  - While waiting, a small spinner shows in the navigation bar.
- *Alternative*: save on leaving the photo only. Rejected because a closed tab or a crash would lose work, and the spec asks for each change to be saved.

### D11. The edit list is the history
- **Model**: like Picasa's `filters=`, `edits` is the record of what was done. Undo removes the last step. There is no Redo, no Revert and no editing of middle steps (the user's choice), so nothing outside `edits` is needed: no history key, no history API, and undo works after a restart and for imported Picasa steps.
- **Reducer**: `editChain.ts` keeps `{ steps, merging }` with actions `load`, `apply` (updates a trailing step of the same filter, as before), `rotate`, `undo` and `commit`. `update`, `remove`, `reset`, `redo`, `past` and `future` are dropped. A slider drag or a second adjustment of the same filter still updates the trailing step, so undo removes that whole step, as Picasa does.
- **Changes panel**: a read-only list. A crop frame opened right after a `crop64` step still edits that trailing step.
- *Alternative*: snapshots of whole chains in an `editHistory` key, which was implemented first. It was replaced because it duplicated `edits` in the file and still could not undo Picasa edits.

### D12. Picasa `filters=` import
- **Parser**: `picasaFilters.ts` reads `name=1,p1,p2;…` items (empty items skipped, a missing `=` drops the item). A first parameter of `0` gives `"enabled": false`.
- **Mapping**:
  - `crop64` gets a `rect`: the hex is padded to 16 digits, split into 16-bit words `left, top, right, bottom`, divided by 65535 and rounded to 6 decimals (doc 08 §4.3).
  - `bw` and `sepia` map to the bundled filters.
  - Filters with documented semantics keep named fields (doc 08 table): `tilt` gets `angle` and `scale`, numbers kept as they are, because the units are not established, so no conversion to `straighten`. `fill`, `unsharp2`, `sat` and `Boost` get `amount`; `finetune2` gets its five fields; `Vignette` gets four.
  - Other filters keep `params`: the raw strings.
  - A malformed value of a known filter, such as bad hex, drops that item.
- **Plumbing**: `PhotoFields.edits` comes from the section, and `'edits'` joins `SUPPORTED_FIELDS` and `sameFields`, so it is imported on the first change, shown live before it, and re-imported for unmodified entries like the other fields. An entry the user edited has `modified`, so a later Picasa change never overwrites Paloma edits (existing conflict rule).
- **Not imported**: `redo=` (no redo), `crop=` (a duplicate of the last `crop64`) and `rotate=` (a separate key, not part of `filters`; can be added later).

### D5. Bar placement### D5. Bar placement
- **Settings**: `{ navBar: Edge; editBar: Edge }` with `Edge = 'top' | 'bottom' | 'left' | 'right'`.
- **Layout function**: `barLayout(settings)` returns, for each bar, its edge, orientation (`row` for top/bottom, `column` for left/right) and its offset from that edge.
  - The navigation bar always has offset 0.
  - The edit bar gets an offset equal to the navigation bar's thickness when they share an edge.
  - When the bars are on adjacent edges, the column bar is inset by the row bar's thickness at that corner, so they never overlap.
- **Thickness**: bar thickness is a CSS variable (`--viewer-bar-size`, 64px to fit the 48px+ touch targets).
- **Edges**: edges are physical CSS `top`/`left` properties, not logical `inset-inline-*`, so they do not mirror in RTL (spec).
- **Floating panels**: a panel opens on the photo side of the edit bar, next to the button that opened it, and is clamped to the window.
- **Overflow**: when the edit bar has more icons than fit, it scrolls along its axis.

### D6. UI settings store
- **Module**: `client/src/settings/uiSettings.ts` exports `loadUiSettings()`, `saveUiSettings()` and `parseUiSettings(raw)`.
- **Storage**: one `localStorage` key `paloma.ui.settings` holds JSON. Each field is validated on its own, so an invalid value falls back to its default and the other fields are kept. All storage access is wrapped in try/catch, as `i18n/index.ts` already does.
- **Store**: a small Zustand store `useUiSettings` holds the parsed settings and writes through on change, so an open viewer and the Settings view stay in sync without a reload.
- **Settings view**: `SettingsView.tsx` is `currentView: 'settings'` with a Navbar button (Lucide `Settings`). It has two groups of four large radio buttons, each with a small picture of the screen showing the bar's position.
- *Alternative*: a server-side settings file. The user chose a per-browser setting.

### D7. Viewer keyboard
- **Handler**: one `keydown` handler on `window` while the viewer is mounted. It ignores events whose target is an `input`, `select`, `textarea` or `[contenteditable]`, except Esc on a range input.
- **Esc**: priority is frame → panel → viewer.
- **Arrow keys**: `←`/`→` use `i18n.dir()`, so in RTL `←` means next. Shift+arrows pan.
- **Zoom keys**: `+`/`=`, `-`, `0`.
- **Undo**: Ctrl/Cmd+Z moves here from `EditorCanvas`.
- **Icons**: the Previous and Next icons use the existing `flip-rtl` class.

### D8. Photo card interactions
- **Card**: the card root becomes `role="button" tabIndex={0}`. A plain click or Enter calls `onOpen(photo)`, which `VirtualPhotoGrid` turns into `openViewer(photos, index)`. Ctrl/Cmd+click or Space toggles selection. `onDoubleClick` is removed.
- **Checkbox**: a real `<button role="checkbox" aria-checked>` in the top-start corner. Like the star, it calls `stopPropagation`. CSS shows it when the photo is selected, and on `:hover` or `:focus-within` otherwise, which replaces the selected-only check icon.

### D9. Filter icons
- **Contract**: `FilterDefinition.icon?: string`, a path relative to the plugin folder. `checkContributions` (or the registry, which knows the folder) resolves it with `path.resolve(pluginDir, icon)`.
- **Rejected paths**: the icon is dropped with a warning (`filter "x": icon … is not an .svg file inside the plugin folder`) when:
  - the resolved path does not start with `pluginDir + path.sep`, which also covers `realpath`, so symlinks out of the folder are rejected;
  - it does not end in `.svg`;
  - the file does not exist at activation.
- **API**: `FilterInfo.iconUrl?: string` is `/api/plugins/<id>/filters/<name>/icon?v=<version>`. The route looks up the active plugin and filter, then sends the resolved file with `Content-Type: image/svg+xml`, `X-Content-Type-Options: nosniff` and a one-day cache. Unknown or inactive → 404 `plugin_not_found`/`filter_not_found`.
- **Client**: the SVG is shown as a CSS `mask-image`, never inlined into the DOM, so a plugin's SVG cannot run scripts in the page, and the icon takes the bar's colour.
- **Bundled icons**: `plugins/basic-transforms/icons/` and `plugins/basic-effects/icons/` get SVGs copied from Lucide (ISC licence, noted in each plugin's folder). The exact icons are picked during implementation, as long as all eight differ. Candidates:
  - `crop`, `rotate-cw`, `flip-horizontal-2`, `ruler` (straighten);
  - `sun` (brightness), `contrast`, a monochrome icon for bw, `coffee` (sepia).

### D10. Preview reports the full size
- **Renderer**: `RenderService.render` already knows the oriented source size and the working size it scales down to. It returns the uniform factor `k = sourceLong / workingLong` (1 when it did not scale down).
- **Headers**: `renderPreview` sends `X-Paloma-Full-Width`/`X-Paloma-Full-Height` = `round(renderedW × k)`, `round(renderedH × k)`, measured before the final `maxSize` resize. Filters are resolution-independent, so this matches a full render up to whole-pixel effects. One example is `straighten`'s fixed 2 px anti-alias margin, which becomes about 6 px when scaled up 3×. The spec allows 0.5%.
- **Client**: `useEditPreview` reads the headers into `EditPreview.fullWidth/fullHeight`.
- **Resolution choice**: when zoomed, the viewer asks for `maxSize = previewSizeFor(fullW × scale, fullH × scale, dpr)`, in steps of 256 and capped at 4096. It only asks again when the needed size grows beyond the current image, or when the chain changes. On returning to fit, the fit-size request is usually cached already.

### Files touched in photo folders
This change reads and writes no files in photo folders beyond what `photo-edits` already does. Auto-save writes the photo's entry in that folder's `.paloma.json` through the existing `PUT /api/photos/:id/edits`, and never writes the photo file. It writes more often than before (on each finished change, not once on Save). Each write goes through `SidecarService`'s existing per-folder serialization. Plugin icons are read from plugin folders only.

### MVP code: reused, rewritten, dropped
- **Reused**:
  - `editChain.ts` (unchanged) and `cropFrame.ts`/`CropOverlay.tsx`/`StraightenGrid`.
  - `useEditPreview.ts`, which gains the full-size headers and a 4096 cap.
  - The parameter-control rendering from `EditorCanvas`, moved into `FilterPanel`.
  - The `stepLabel` logic, moved into the Changes list.
- **Rewritten**: `PhotoCard.tsx` (click handling, checkbox), the `usePalomaStore` viewer state, `App.tsx` (viewer overlay, settings view), `Navbar.tsx` (Settings button), `renderApi.renderPreview` and `RenderService.render` (full-size factor), `contributions.ts`/registry (icon), and `GET /api/plugins` mapping.
- **Dropped**: `EditorCanvas.tsx`, `currentView: 'editor'`, `activeEditPhoto`/`setActiveEditPhoto`, and the `editor.save`, `editor.saving` and `editor.title` strings. `editor.reset` is replaced by `editor.revert`.

## Risks / Trade-offs

- [Auto-save writes `.paloma.json` on every slider release] → Writes only happen on commit, not while dragging, and are serialized per photo. The sidecar is small, and `SidecarService` already writes atomically.
- [Zoomed previews up to 4096 px take longer to render, especially while editing] → The current image stays on screen scaled until the sharper one arrives. The debounce and abort in `useEditPreview` drop intermediate requests. Above 4096 px the photo is scaled up (non-goal).
- [Full-size dimensions are derived from a working-size render] → Filters are resolution-independent by contract, but whole-pixel details such as `straighten`'s 2 px margin scale with the working size. The spec allows 0.5%, which is enough for a zoom percentage. A test compares the headers against a full render for crop, rotate and straighten.
- [Plugin SVG icons are untrusted content] → They are only used as CSS masks (never inline or `<object>`), served with `nosniff` and confined to the plugin folder.
- [Undo after a second adjustment of the same filter removes the whole step, not just the last adjustment] → This is the Picasa behaviour the user asked for; the value can be set again from the filter's panel.
- [Imported Picasa filters that no plugin provides (autolight, finetune2, …) are kept but not rendered, so a Picasa-edited photo can look different in Paloma] → They show as unavailable in Changes and can be undone; plugins can implement them later.
- [Removing click-to-select changes a habit from the MVP] → The corner checkbox is visible on hover, and Ctrl/Cmd+click remains. The tray and map selection flows are unchanged.

## Migration Plan

Client and server ship together, and no data migration is needed: saved `edits` keep the same format. Rollback means reverting the commit. Settings left in `localStorage` are ignored by older builds.
