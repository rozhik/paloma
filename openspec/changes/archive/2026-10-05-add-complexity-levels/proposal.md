# Proposal

## Why

Paloma shows every tool to everyone. A child who only wants to look at the family albums can delete an album, move a photo on the map or crop a picture by accident, and a beginner faces the same toolbars as an experienced user. The plugin system will keep adding tools, so the UI needs a way to show each user only what fits them, and to lock a device for a child.

## What Changes

- Add a **level** setting with five ordered levels: **Child**, **Easy**, **Normal**, **Professional**, **Developer**. A control or plugin tagged with a level is shown at that level and at every higher level. Developer shows everything.
- Everything that exists today is available at **Normal**, which is the default, so nothing changes for current users.
- **Child**: only browsing albums, the photo viewer without editing, and the new slideshow. Every control that can change something (selection and tray, star, album management, edit bar, map placing, plugins, collage, movie, people, folders, search, language switcher in the top bar) is hidden.
- **Easy**: Child plus folders and shortcuts in the sidebar, search, selection and the tray's album, export and print actions, starring, the language switcher, and the edit bar with the simple filters of the bundled `basic-effects` plugin.
- **Normal** adds everything else that exists today: people, map and placing photos, collage, movie, plugins view, album properties and delete, removing locations, and the `basic-transforms` filters (crop, rotate, flip, straighten).
- **Professional** and **Developer** have nothing extra yet; they show what later changes and plugins tag for them.
- **PIN code**: choosing Child requires setting a 4–8 digit PIN. At Child, opening Settings asks for the PIN; leaving Settings locks them again. Leaving Child removes the PIN. Repeated wrong PINs make the user wait.
- **Settings order**: the Settings view starts with a **Language** section, then the **Level** section, then the existing sections.
- **Level attribute for controls and plugins**: every navigation item, sidebar list, tray action and other changing control in the client has a level in one table. A plugin manifest and each filter a plugin contributes may declare `level`; it defaults to `normal`. `GET /api/plugins` reports the levels.
- **Slideshow**: a new full-screen slideshow of the current album or folder, available at every level, with play/pause, previous/next, a choice of interval and exit.
- Level and PIN are kept in this browser like the other UI settings. This is a convenience lock for children, not a security boundary: the server does not enforce levels, and clearing the browser's site data removes the PIN.

## Capabilities

### New Capabilities
- `complexity-levels`: the five levels, their order and default; which controls each level shows; the level attribute of controls and plugin filters; Child mode and the Settings PIN; levels are remembered in this browser and apply in every skin.
- `slideshow`: starting, playing, controlling and leaving a full-screen slideshow of the photos in the grid.

### Modified Capabilities
- `app-settings`: the Settings view starts with Language and Level sections; at Child it is opened only with the PIN.
- `localization`: the language switcher is in the Settings view's Language section; the top bar keeps its switcher from Easy level up.
- `plugins`: the manifest and contributed filters may declare a `level`; the Plugins API reports it.

## Impact

- **Depends on** `add-skins-and-themes` (skins render the shell, grid and viewer chrome that levels filter; the Settings view's Appearance section). Archive it before this change.
- **Client**: new `client/src/levels/` (level ids and order, the control-level table, `useLevel` hooks, PIN hashing and checks, PIN dialog); `uiSettings.ts` gains `level` and `pin`; `SettingsView.tsx` gains the Language and Level sections and the PIN lock; `shell/navigation.ts`, `shell/useTray.tsx`, `shell/sidebar.tsx`, the skins' components, `AlbumHeader.tsx`, `PlacesMap.tsx`, the viewer's edit bar and the library filter by level; new slideshow component and a Slideshow button in the library.
- **Server**: `server/src/plugins/manifest.ts` and `registry.ts` read and validate `level` for plugins and filters; `api.ts` gains the optional `level` field.
- **Shared types**: `ComplexityLevel` type; `PluginInfo` and `FilterInfo` gain `level`.
- **Bundled plugins**: `basic-effects` declares `"level": "easy"`; `basic-transforms` keeps the default `normal`.
- **i18n**: level names and descriptions, PIN dialog, slideshow and Settings section strings in all 11 locale files.
- **Docs**: `docs/plugins.md` documents the `level` field; a short `docs/complexity-levels.md` lists what each level shows and how to tag a new control.
- **Photo folders, sidecars, plugin folders**: no changes. Nothing new is written next to photos.
