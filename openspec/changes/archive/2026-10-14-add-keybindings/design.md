# Design

## Context

Keys today are separate `keydown` listeners, each with its own "is the user typing" check:

- `client/src/components/viewer/usePhotoViewer.ts` — Esc, `←`/`→` (RTL-aware), Shift+arrows (pan), `+`/`=`/`-`/`0` (zoom), Ctrl/⌘+Z (undo); `isInfoKey` (`i`) here and `isFacesKey` (`f`) in `faceRects.ts`.
- `client/src/components/slideshow/Slideshow.tsx` — Esc, Space, `←`/`→`.
- `client/src/shell/SquarePhotoCard.tsx`, `client/src/appearance/skins/classic/ClassicPhotoCard.tsx` — Enter, Space on a focused card.
- `client/src/appearance/skins/glass/components.tsx` — Esc closes a Glass panel.

Level and permission gating lives in `CONTROL_LEVELS` / `CONTROL_PERMISSIONS` (`client/src/levels/controls.ts`) and `useAllows()`. UI settings are browser-only (`client/src/settings/uiSettings.ts`, zustand + localStorage). The server has per-user tables created in `server/src/db/columns.ts`; with auth off every request carries `OFF_PRINCIPAL` (`user: null`). Routes start with a `need()` guard (`server/src/auth/middleware.ts`), checked by `routes/guards.test.ts`. `shared/**/*` is compiled into both client and server.

Requirements are in `specs/keybindings/spec.md`; motivation in proposal.md.

## Goals / Non-Goals

**Goals:**
- One dispatcher for all keymap keys, so typing, dialogs, levels, permissions and RTL are handled once.
- One catalog and one validator shared by client and server, so both agree on what a valid keymap is.
- Keymaps that survive Paloma upgrades: new actions get preset keys without touching stored keymaps.

**Non-Goals:**
- Key sequences (`g` then `l`) and press-and-hold bindings. Only single chords.
- Keys inside forms and dialogs (Settings, Account, Admin, Server settings, pickers): they keep native Tab/Enter/Esc.
- Sharing keymaps between users, or user-defined presets on the server. A keymap is moved between users or installs only by JSON file.
- Gamepad input. `tvBox` covers remotes that send keyboard events.

## Decisions

### 1. Catalog and presets live in `shared/keymaps.ts`
A data module (not only types) with `SECTIONS` (ordered, with the scope groups), `ACTIONS` (id → section, control id, `when` hint) and the three presets as plain objects. `shared/types.ts` gets the types: `ActionId`, `SectionId`, `KeyChord` (string), `Keymap`, `KeymapFile`, `KeymapPreset`. The validator `validateKeymap(input, knownFilters?) → { keymap, dropped[] } | { errors[] }` lives next to it and is used by the server on PUT and by the client before upload (for early, localized messages).

*Alternative:* presets as JSON files under `server/` served to the client. Rejected: the client needs the catalog synchronously at start for the offline fallback (spec: Default keymap), and duplicating ids in JSON and TS invites drift. Action **names** stay in client i18n (`keys.action.<id>`, `keys.section.<id>`); the English names for the downloaded file come from the English locale.

### 2. Stored keymap = overrides over a preset
Stored document: `{ name, basedOn: 'mac'|'windows'|'tvBox', bindings: { [actionId]: KeyChord[] } }`. An action absent from `bindings` takes the preset's keys; `[]` means unbound on purpose. The effective keymap is `resolve(preset, bindings)`. Choosing a preset stores `{ name: <preset name>, basedOn, bindings: {} }`. Reset action = delete its key from `bindings`; reset all = `bindings: {}`.

*Alternative:* store the full resolved keymap. Rejected: actions added in later versions would be unbound for everyone who ever saved.

Conflict checks run on the **resolved** keymap, because a preset key can collide with an override.

### 3. JSON file format
```json
{
  "format": "paloma-keymap",
  "version": 1,
  "name": "My keys",
  "basedOn": "mac",
  "sections": [
    { "id": "viewer", "name": "Viewer",
      "actions": [ { "id": "viewer.next", "name": "Next photo", "keys": ["ArrowRight", "N"] } ] }
  ]
}
```
Download writes every action of the resolved keymap (self-contained, readable). Upload turns each listed action into an override; actions not in the file fall back to `basedOn`. `name` fields are ignored on upload. Filename: the keymap name, sanitized, plus `.paloma-keys.json`. Limit 256 KB (enforced by the route's `express.json` limit and by the client before reading the file).

### 4. Key chord notation
`[Ctrl+][Alt+][Shift+][Meta+]<Key>` in that fixed order. `<Key>` is `KeyboardEvent.key` with single letters upper-cased (`A`), `' '` written `Space`, and named keys as the browser reports them (`ArrowLeft`, `Escape`, `Enter`, `PageDown`, `MediaPlayPause`, `ColorF0Red`, `GoBack`, `BrowserBack`). When Alt or Meta is held, letters and digits come from `KeyboardEvent.code` (`KeyA` → `A`, `Digit1` → `1`), because ⌥ on macOS changes `key` (`⌥1` gives `¡`). Shift with a printable symbol keeps the produced symbol and drops `Shift` (`+` not `Shift+=`), so layouts differ less. One function `chordOf(event)` is used by both the dispatcher and key capture on the editor page, which guarantees a captured key matches later.

### 5. One dispatcher, scopes registered by screens
`client/src/keys/` holds `keymapStore` (a zustand store for `GET /api/keymap`, falling back to the device default; the client uses zustand, not TanStack Query, for its other server state too), `KeyDispatcher` (one `keydown` listener on `window`, capture phase off) and `useKeyActions(section, handlers)` which a screen calls to register what its actions do right now. Dispatch order:
1. Ignore if `event.isComposing`, or if focus is in `input`, `textarea`, `select`, `[contenteditable]`, `[role=slider]`, `[role=textbox]`, `[role=combobox]` — except Esc when the control did not `preventDefault`.
2. If a `.modal.show` is open, only Global runs (and only when the modal does not take the key).
3. Mirror `ArrowLeft`/`ArrowRight` when `i18n.dir() === 'rtl'`.
4. Look up the chord in the active sections (Global + the registered screen sections). Run the handler only if `useAllows(controlOf(action))` and the handler's `enabled()` is true (e.g. selection non-empty); then `preventDefault()`.

Esc handling for nested UI (floating panel → Info panel → frame → viewer) stays where it is: those components handle Esc first and stop propagation; `viewer.close` only runs if nothing did. The Glass panel's own Esc listener stays (it is a dialog-like panel, not an action).

*Alternative:* keep per-component listeners and read the chord from the keymap in each. Rejected: the typing/level/RTL rules would stay duplicated, which is exactly what produced `isInfoKey`/`isFacesKey`.

### 6. Catalog (initial) and preset keys
Selection actions work on the photos in the tray; in the viewer, actions on the shown photo are in Viewer/Edit. Control ids refer to `CONTROL_LEVELS`.

| Section | Action id | mac | windows | tvBox |
| :--- | :--- | :--- | :--- | :--- |
| Global | `global.library` | `Alt+1` | `Alt+1` | `ColorF0Red` |
| Global | `global.people` | `Alt+2` | `Alt+2` | — |
| Global | `global.map` | `Alt+3` | `Alt+3` | — |
| Global | `global.tasks` | `Alt+4` | `Alt+4` | — |
| Global | `global.settings` | `Meta+,` | `Ctrl+,` | — |
| Global | `global.search` | `Meta+F` | `Ctrl+F` | — |
| Library | `library.open` | `Enter` | `Enter` | `Enter` |
| Library | `library.toggleSelect` | `Space` | `Space` | `ColorF3Blue` |
| Library | `library.focusLeft/Right/Up/Down` | arrows | arrows | arrows |
| Library | `library.selectAll` | `Meta+A` | `Ctrl+A` | — |
| Library | `library.slideshow` | `Meta+Enter` | `Ctrl+Enter` | `MediaPlayPause` |
| Selection | `selection.clear` | `Escape` | `Escape` | `GoBack`, `BrowserBack` |
| Selection | `selection.star` | `S` | `S` | `ColorF2Yellow` |
| Selection | `selection.addToAlbum` | `A` | `A` | — |
| Selection | `selection.addTags` | `T` | `T` | — |
| Selection | `selection.removeTag` | `Shift+T` | `Shift+T` | — |
| Selection | `selection.removeFromAlbum` | `Shift+A` | `Shift+A` | — |
| Selection | `selection.makeCover` | `K` | `K` | — |
| Selection | `selection.removeLocation` | `Shift+L` | `Shift+L` | — |
| Selection | `selection.export` | `Meta+E` | `Ctrl+E` | — |
| Selection | `selection.print` | `Meta+P` | `Ctrl+P` | — |
| Selection | `selection.collage` | `Shift+C` | `Shift+C` | — |
| Selection | `selection.movie` | `Shift+M` | `Shift+M` | — |
| Viewer | `viewer.close` | `Escape` | `Escape` | `Escape`, `GoBack`, `BrowserBack` |
| Viewer | `viewer.previous` / `viewer.next` | `ArrowLeft` / `ArrowRight` | same | same |
| Viewer | `viewer.info` | `I` | `I` | `ColorF1Green` |
| Viewer | `viewer.faces` | `F` | `F` | — |
| Viewer | `viewer.objects` | `O` | `O` | — |
| Viewer | `viewer.star` | `S` | `S` | `ColorF2Yellow` |
| Viewer | `viewer.zoomIn` / `zoomOut` / `zoomReset` | `+`,`=` / `-` / `0` | same | — |
| Viewer | `viewer.panLeft/Right/Up/Down` | `Shift+`arrows | `Shift+`arrows | — |
| Edit | `edit.undo` | `Meta+Z` | `Ctrl+Z` | — |
| Edit | `edit.showOriginal` | `\` | `\` | — |
| Edit | `edit.basic-transforms.<filter>` | crop `C`, rotate `R`, flip `Shift+F`, straighten `Shift+R` | same | — |
| Edit | `edit.basic-effects.<filter>` | brightness `B`, contrast `Shift+B`, black & white `G`, sepia `Shift+G` | same | — |
| Slideshow | `slideshow.playPause` | `Space` | `Space` | `MediaPlayPause`, `Enter` |
| Slideshow | `slideshow.previous` / `next` | arrows | arrows | arrows |
| Slideshow | `slideshow.exit` | `Escape` | `Escape` | `Escape`, `GoBack`, `BrowserBack` |
| People | `people.add`, `people.unrecognized`, `people.findFaces` | `N`, `U`, `Shift+F` | same | — |
| Map | `map.zoomIn` / `map.zoomOut`, `map.placePhotos` | `+` / `-`, `P` | same | — |
| Collage | `collage.save`, `collage.close` | `Meta+S`, `Escape` | `Ctrl+S`, `Escape` | —, `GoBack` |

The exact filter ids and the People/Map/Collage buttons are confirmed against the code in task 1.2; any single-instance button found there gets an action with keys in `mac`/`windows` (the "every action has a key" rule is enforced by a test). `viewer.star` is new behavior: the viewer had no star key; it needs `photo.star`.

Plugin filters: the client adds `edit.<pluginId>.<filterId>` for every installed filter; only the bundled plugins have preset keys. The server accepts any id matching `^edit\.[a-z0-9-]+\.[a-zA-Z0-9-]+$` so uninstalled-plugin bindings survive.

### 7. Server storage and API
New table, created idempotently in `server/src/db/columns.ts` (`createKeymapTables`) and declared in `schema.ts`:
```
keymaps(owner TEXT PRIMARY KEY, name TEXT NOT NULL, based_on TEXT NOT NULL, bindings TEXT NOT NULL, updated_at TEXT NOT NULL)
```
`owner` is the user id, or `'~single'` for `OFF_PRINCIPAL` (cannot clash: usernames/ids never contain `~`). `deleteUser` deletes the row in its transaction.

Routes in `server/src/routes/keymap.ts`, all `need('authenticated')` (tokens allowed — the spec allows reading by token; no permission needed):
- `GET /api/keymap` → `{ keymap: KeymapFile | null }` listing only the keymap's own bindings (`null` = nothing stored; client uses the device default).
- `PUT /api/keymap` body `KeymapFile` (the one wire format: listed actions become the overrides, so the client's edits and uploads use the same request) → validated by `validateKeymap`; 400 `invalid_keymap` with `{ errors: [{ code, actions? }] }`; 200 `{ keymap, dropped: string[] }`.
- `GET /api/keymap/presets` → `[{ id, keymap }]` (the client already has them; this is for API clients and the MCP side).

The server never reads or writes photo folders for this; only the SQLite database in `PALOMA_DATA_DIR`.

### 8. Client UI
- `AppView` gains `'keybindings'`. It is not in the navigation; it is opened from Settings → Keyboard (like the user-menu views are opened from the menu).
- Control ids: `settings.keyboard` (normal), `view.keybindings` (normal), `keybindings.importExport` (pro). No permission: they change only the user's own keymap; add them to the read-only list in `controls.test.ts`'s sense of "changes nothing shared".
- Settings → Keyboard: current name, "based on" preset, preset radio list, **Edit keys** button. Confirm dialog when `bindings` is non-empty.
- Keybindings page: header with editable name, filter field, Reset all; per section a table: action name | key chips (× to remove) | Add key | Reset. Add key opens an inline capture state ("Press a key… / Cancel") that records the next chord via `chordOf`, including Esc; the dispatcher is suspended while capturing. Conflicts show an inline alert with **Move here** / **Cancel**. Each change is an optimistic store update with rollback on error.
- Pro: **Download** (Blob + `a[download]`) and **Upload** (file input → client-side validate → confirm → PUT; shows `dropped`).
- Key chips render chords with platform glyphs on mac (`⌘ ⌥ ⇧ ⌃`), text elsewhere.

### 9. MVP code reused, rewritten, dropped
- **Rewritten:** the `keydown` handler in `usePhotoViewer.ts` and `Slideshow.tsx` become `useKeyActions` registrations; the handlers they call (`go`, `zoomBy`, `pan`, `undo`, `toggleInfo`…) are reused unchanged.
- **Dropped:** `isInfoKey` (`usePhotoViewer.ts`) and `isFacesKey` (`faceRects.ts`) and their tests; replaced by dispatcher tests.
- **Rewritten:** card `onKeyDown` in `SquarePhotoCard.tsx` and `ClassicPhotoCard.tsx` route Enter/Space through `library.open`/`library.toggleSelect` (the focused card is the target).
- **Reused:** `useAllows`, `CONTROL_LEVELS`, `i18n.dir()`, the Settings view layout, `asyncRoute`/`need`, the `columns.ts` table pattern.
- **Kept as is:** Esc handling inside InfoPanel, TagChips, PersonPicker, SimilarFaces and the Glass panel (they are form/dialog keys).

## Risks / Trade-offs

- [Browsers reserve some chords (`Ctrl+W`, `Ctrl+T`, `Ctrl+N`, `Meta+Q`); `preventDefault` cannot stop them] → The editor warns when capturing a chord from a known reserved list; presets avoid them.
- [Plain-letter keys (`S`, `A`, `T`) fire while focus is on a non-text control] → The typing guard covers text-like roles; plain letters only act when photos are selected / the viewer is open.
- [TV remotes report Back inconsistently (`GoBack`, `BrowserBack`, `Escape`, sometimes `Backspace`)] → `tvBox` binds the common three; users can add `Backspace` in the editor.
- [`event.code` fallback for Alt/Meta assumes a QWERTY-position mapping on non-Latin layouts] → Acceptable for modifier chords; plain keys use `event.key`, so `I` on a Ukrainian layout is `Ш` and users can rebind.
- [The keymap loads after the first render] → The device default is used until the query resolves; the stored keymap replaces it without reload.
- [A level/permission change while a key is held] → Checks run per key press via `useAllows`, so they are always current.

## Migration Plan

- The table is created on start (`CREATE TABLE IF NOT EXISTS`); no data migration. Users start with no stored keymap, i.e. the device default, whose viewer/slideshow/card keys equal today's.
- Rollback: an older server ignores the table; the client falls back to hardcoded keys in the old code.

## Open Questions

- Exact English names of each action (wording only; decided while writing `en` translations).
