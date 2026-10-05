# Design

## Context

- The UI is built by skins (`add-skins-and-themes`, not archived yet): `App.tsx` renders `skin.AppShell` around shared views, and skins get their data from shared hooks: `useNavigationItems()` (`shell/navigation.ts`), `useTray()` (`shell/useTray.tsx`), `useSidebarSections()` (`shell/sidebar.tsx`), `useLibraryPhotos()`, plus `SquarePhotoCard` and `ViewerChrome`. Because these hooks are shared, filtering by level there reaches all three skins at once.
- UI preferences live in `settings/uiSettings.ts`, a zustand store saved as JSON under `paloma.ui.settings` in `localStorage`, with each field validated on its own. The language is stored separately by i18n (`i18n/index.ts`).
- Changing controls outside those hooks: `AlbumHeader.tsx` (Edit properties, Delete), `PlacesMap.tsx` (place photos, remove location), the viewer's edit bar (`EditBar.tsx`, `FilterPanel.tsx`), the language switcher in each skin's top bar, and search in each skin's top bar.
- Plugins: `server/src/plugins/manifest.ts` validates manifests; `registry.ts` builds `PluginInfo`/`FilterInfo` (in `shared/types.ts`) for `GET /api/plugins`; `api.ts` holds the plugin-facing types (`FilterDefinition`). `docs/plugins.md` is the plugin author guide, and `docsExample.test.ts` checks that its example works.
- Paloma is often opened from a tablet over plain HTTP on the local network, so `crypto.subtle` (secure contexts only) cannot be relied on.
- There is no slideshow in the MVP.

## Goals / Non-Goals

**Goals:**
- One place that says which level every control has, so a new control cannot be added without a level, and so skins don't decide visibility themselves.
- Plugin authors can tag a plugin or a single filter.
- A Child lock that a child cannot get around by clicking around the UI.

**Non-Goals:**
- Enforcement on the server. API calls still work at any level; levels only shape the UI. A server-side lock would need accounts or a server PIN and is a separate decision.
- Protection against someone who opens DevTools or clears site data. That removes the PIN and the level (back to Normal). This is documented.
- Per-user levels, or levels synced across browsers.
- Hiding or tagging Settings sections by level. Settings shows all sections at every level once it is open.
- Things that are only for Professional or Developer. The levels exist and filter correctly, but nothing is tagged above Normal in this change.

## Decisions

### D1. Level ids, order and comparison
`client/src/levels/levels.ts` exports `LEVELS = ['child', 'easy', 'normal', 'pro', 'developer'] as const`, `type Level`, and `atLeast(active, required)`, which compares by index. `shared/types.ts` gets `ComplexityLevel` with the same union, because the server validates plugin levels and returns them. The id is `pro` and the display name is "Professional". The client reuses the shared type, so there is one definition.

*Alternative*: numeric levels (0–4). Rejected because manifests are written by hand and `"level": "easy"` is self-explanatory.

### D2. One table of control levels
`client/src/levels/controls.ts` holds `CONTROL_LEVELS: Record<ControlId, Level>`, typed so that every `ControlId` must have an entry:

| Level | Controls |
|---|---|
| child | `view.library`, `view.settings`, `sidebar.albums`, `photo.open`, `viewer.navigate`, `viewer.zoom`, `slideshow` |
| easy | `sidebar.shortcuts`, `sidebar.folders`, `search`, `photo.select`, `photo.star`, `tray.addToAlbum`, `tray.removeFromAlbum`, `tray.makeCover`, `tray.clear`, `tray.export`, `tray.print`, `languageSwitcher`, `viewer.editBar` |
| normal | `view.people`, `view.map`, `view.collage`, `view.plugins`, `tray.removeLocation`, `tray.collage`, `tray.movie`, `album.editProperties`, `album.delete`, `map.placePhotos`, `map.removeLocation` |

`NAV_ITEMS`, `TRAY_ACTION_IDS` and `SIDEBAR_LISTS` map to these ids (`view.<id>`, `tray.<id>`, `sidebar.<id>`). A test checks that every nav item, tray action and sidebar list has a table entry, so a new one without a level fails the build or the test.

`useLevel()` returns the active level. `useAllows(controlId)` returns whether a control is available. The shared hooks filter their output: `useNavigationItems`, `useTray().actions` and `useSidebarSections` return only available entries. Skins render what they get and only check `useAllows` for controls they draw themselves (search, language switcher). `SquarePhotoCard` drops the checkbox, star and Ctrl/Cmd+click/Space selection when `photo.select` and `photo.star` are not allowed. `ViewerChrome` gets `editBar: null` when `viewer.editBar` is not allowed, and the viewer's key handler ignores edit shortcuts then.

*Alternative*: a `level` prop on each component, or CSS hiding. Rejected: it spreads the decision across three skins, and CSS-hidden controls stay reachable by keyboard and screen readers.

### D3. Plugin and filter levels
- `manifest.ts`: optional `level`; a value outside `LEVELS` makes the manifest invalid ("level must be one of child, easy, normal, pro, developer"). Missing means `normal`.
- `api.ts`: `FilterDefinition.level?: ComplexityLevel`. `registry.ts`: when the level is invalid, the filter is dropped with a plugin warning, like an invalid icon. The effective level is the filter's own level, or the plugin's level when the filter has none.
- `PluginInfo.level` and `FilterInfo.level` are always set in the API response.
- Edit bar: shows a filter when `atLeast(active, filter.level) && atLeast(active, plugin.level)`. Rendering and the edit chain (`editChain.ts`) do not look at levels, so hidden steps are kept and rendered.
- `plugins/basic-effects/paloma-plugin.json` gets `"level": "easy"`. `basic-transforms` stays at the default. Plugin folders are part of the Paloma repository here; nothing in a user's external plugin folder is written.
- `PLUGIN_API_VERSION` stays 1: the fields are optional and old plugins keep working. An older Paloma ignores an unknown manifest key.

### D4. Level and PIN in `uiSettings`
`UiSettings` gains `level: Level` (default `normal`) and `pin: { salt: string; hash: string } | null` (default `null`). Parsing validates per field, as today. In addition, `level === 'child'` with no valid `pin` is parsed as `normal` (spec: "Child without a valid stored PIN"). `update()` cannot store `child` without a `pin`. That rule lives in a pure `normalizeLevel()` with tests.

Hash: `hash = sha256(salt + ':' + pin)` in hex, with a 16-byte random `salt` from `crypto.getRandomValues` (available over plain HTTP). SHA-256 is a small pure-TS implementation in `levels/sha256.ts`, tested against the NIST vectors. A 4–8 digit PIN can be brute-forced from the hash offline anyway; the hash only keeps the digits from being readable at a glance. Since this is a convenience lock (Non-Goals), that is acceptable.

*Alternatives*: `crypto.subtle.digest` (unavailable over HTTP on a tablet), or a new npm dependency (not worth it for 60 lines).

### D5. Child lock flow
- `levels/usePinGate.ts` holds the in-memory state: `unlocked` (boolean), `failures`, `lockedUntil`. These are not persisted, so a reload resets the wait. That is acceptable for the same reason as D4.
- `setCurrentView('settings')` at Child does not switch views directly. The Settings nav item opens `PinDialog` instead, and a correct PIN sets `unlocked = true` and then the view. Any `setCurrentView` to another view sets `unlocked = false`. `App.tsx` renders `SettingsView` only if `level !== 'child' || unlocked`; otherwise it shows the library, so no other path reaches Settings.
- `PinDialog` (shared, Bootstrap modal, large numeric keypad buttons plus a `inputmode="numeric"` field) has modes `unlock`, `create` (twice) and `change` (twice). After the fifth wrong entry it sets `lockedUntil = now + 30 s` and shows a countdown.
- Choosing Child in the Level section opens `create`. On success it calls `update({ pin, level: 'child' })` and runs `enterChildMode()`: clear the tray selection, clear the folder and filter selection (an album stays selected), close the export, print and movie dialogs, and set `unlocked = true`, so the user who just set it is still in Settings. Choosing another level while at Child calls `update({ level, pin: null })`.

### D6. Child library
`useLibraryPhotos()` returns no photos at Child when no album is selected, and the library shows an "Choose an album" empty state. `useSidebarSections()` returns only `albums`. Because the shell and grid already render from these hooks, no skin needs its own Child layout. When the Compact skin's sidebar is collapsed to a strip at Child, the strip still offers the album list.

### D7. Settings layout
`SettingsView.tsx` sections in order: **Language** (the list of languages as large radio choices in their native names, the same `LANGUAGES` and `changeLanguage()` as the switcher), **Level** (five large radio choices with name and description, plus "Change PIN" at Child), then **Appearance** and **Viewer** as now. The language selection uses the existing i18n storage; nothing new is stored.

### D8. Slideshow
- New `client/src/components/slideshow/Slideshow.tsx`, a fixed full-window overlay rendered from `App.tsx` like `PhotoViewer`. State `slideshow: { photos, index } | null` in `usePalomaStore` with `startSlideshow(photos, index)` and `stopSlideshow()`.
- The image is the same edited preview the viewer loads for a photo, reusing the viewer's URL helper rather than a new endpoint, with a fitted `<img>`. The next photo is preloaded with `new Image()`.
- Logic in a pure `slideshowReducer` (play/pause, next/prev with wrap, tick, interval) with unit tests. The component only drives timers and keys. The interval goes into `uiSettings` as `slideshowInterval: 3 | 5 | 10` (default 5).
- Full screen: `document.documentElement.requestFullscreen()` in the click handler (user gesture). Its rejection is ignored. `fullscreenchange` to not-fullscreen stops the slideshow; Esc also stops it.
- The Slideshow button is a shared `SlideshowButton` rendered by `AlbumHeader` for albums and by each skin's library toolbar or area above the grid for folders. It is the `slideshow` control (level child). It starts from the first selected photo in grid order if there is one, otherwise from index 0.

### D9. What is reused, rewritten or dropped
- **Reused**: the skin hooks, `uiSettings` storage and validation, `LanguageSwitcher` data (`LANGUAGES`, `changeLanguage`), `ConfirmModal`/Bootstrap modals, the viewer's image URL, the plugin manifest and registry validation style.
- **Rewritten**: `SettingsView.tsx` section order; `SquarePhotoCard` selection and star become conditional; the edit bar's filter list.
- **Dropped**: nothing.
- **Files in photo folders**: none read or written by this change. Plugin folders: only the bundled `basic-effects` manifest in this repository changes.

## Risks / Trade-offs

- [A child clears site data or opens DevTools and leaves Child] → Documented as a convenience lock. The Level section's description of Child says so. A server-side lock can be a later change.
- [A new control is added without a level and shows at Child] → `ControlId` typing plus the table test cover nav, tray and sidebar entries. `docs/complexity-levels.md` tells contributors to add every changing control to the table.
- [The `add-skins-and-themes` change is unarchived and still moving] → This change depends on it and touches only its shared hooks and the three skins' top bars. Archive it first.
- [Easy users see crop steps they cannot edit] → The edit chain keeps and renders them (spec). Undo in the editor still works on the steps the user added.
- [Full-screen requests fail in some embedded browsers] → The slideshow falls back to filling the window (spec).

## Migration Plan

No data migration. Stored UI settings without `level`, `pin` or `slideshowInterval` parse to Normal, no PIN and 5 s, so existing users see no change. Rollback: an older build ignores the new keys.
