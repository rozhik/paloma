# Proposal

## Why

Paloma's keyboard use is a handful of keys hardcoded in the viewer, the slideshow and the photo cards (`←`/`→`, Esc, `i`, `f`, Space, Enter, Ctrl/⌘+Z, zoom keys). Most actions have no key at all, keys cannot be changed, and they do not fit every device: a TV box remote has arrows, OK and Back but no modifiers. Picasa users expect a keyboard-driven tool, and Paloma is about to run on more devices (home servers shown on a TV), so keys need to be a first-class, per-user, editable setting.

## What Changes

- An **action catalog**: every action that is the only one of its kind on the current screen (close the viewer, next photo, open Settings, start the slideshow…) and every action that applies to the selected photos or the focused element (star, add to album, rotate, export…) gets a stable action id, a localized name and a section (Global, Library, Selection, Viewer, Slideshow, …).
- A **keymap** is a named list of sections, each with its actions and their keys. An action can have several keys, or none.
- Three **preset keymaps** ship with Paloma and cannot be changed: `mac`, `windows` and `tvBox`.
- Each user has **exactly one keymap of their own**, kept on the **server** (in Paloma's database, never in the photo folders), so it follows them to every browser. With users off, the single user has one.
- **Settings → Keyboard** (Normal level and up) lets the user replace their keymap with a copy of a preset. Until they choose, the server gives them a copy of `mac` on Apple devices and `windows` otherwise.
- A separate **Keybindings page** (Normal level and up), opened from Settings, lists the user's keymap by section and lets them rename it, add, change and remove keys, and reset one action or the whole keymap to the preset it came from. Conflicting keys in the same scope are refused.
- At **Professional** level and up, the Keybindings page can **download** the keymap as a JSON file and **upload** one to replace it.
- Keys only reach actions the level and the user's permissions allow; keys typed into text fields go to the field.
- The existing hardcoded keys become the defaults of the `mac` and `windows` presets and are dispatched through the keymap. **BREAKING** (behavior only): users who rebind an action no longer get the old key for it.
- The Settings view, so far limited to settings kept in this browser, gains one section kept on the server: the keymap choice.

## Capabilities

### New Capabilities
- `keybindings`: the action catalog, keymaps and their JSON format, the preset keymaps, each user's server-side keymap and its API, choosing a preset in Settings, the Keybindings editor page, JSON download and upload, and how key presses are dispatched to actions.

### Modified Capabilities
- `app-settings`: the Settings view gets a Keyboard section whose choice is kept on the server, not in the browser.
- `complexity-levels`: levels for the new controls (choosing a preset and editing keys at Normal, JSON download/upload at Professional), and keyboard shortcuts follow the user's keymap.
- `photo-viewer`: viewer keys come from the user's keymap; the current keys become the defaults.
- `photo-info`: the Info panel key comes from the user's keymap (`i` by default).
- `slideshow`: slideshow keys come from the user's keymap.
- `photo-grid`: the card keys (Enter, Space) come from the user's keymap.

## Impact

- **Server**: a new `keymaps` table (one row per user, plus one for the single user with users off), routes `GET/PUT /api/keymap`, `GET /api/keymaps/presets`, validation of keymap JSON, preset files shipped with the server; tests.
- **Client**: an action registry and one global key dispatcher replacing the `keydown` handlers in `usePhotoViewer.ts`, `Slideshow.tsx`, `faceRects.ts`, the photo cards and the Glass skin; a Keyboard section in Settings; a new `keybindings` view; new control ids in `client/src/levels/controls.ts`; translations for action and section names.
- **Shared**: `Keymap`, `KeymapSection`, `ActionId` and `KeyChord` types in `shared/types.ts`.
- **Docs**: a new `docs/keybindings.md` and links from `AGENTS.md` and `docs/complexity-levels.md`.
- No change to files in the photo folders.
