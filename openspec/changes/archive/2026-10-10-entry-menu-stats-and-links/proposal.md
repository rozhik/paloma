# Proposal

## Why

The top bar carries two things people rarely use, Plugins and the language switcher, next to the views they use every day. Meanwhile an album, folder or tag offers its actions only after it is opened, and nothing shows how big a collection is: its total size, file count or date range. The photo Info panel lists albums and people as plain text, so it is no way to get to them. The grid's mark for a modified photo is a small icon in the caption that only Classic shows clearly.

## What Changes

- **BREAKING (UI)**: The top bar loses its Plugins button and its language switcher in every skin. Plugins becomes a section of the Settings view, shown from the Normal level up. The language can be changed only in the Settings view's Language section, which already exists.
- New **entry menu** in the sidebar: each entry (shortcut, memory, album, tag, person, folder, Unrecognized) gets a menu button next to its photo count. The menu acts on that entry and offers:
  - the actions its grid header offers today (slideshow, find faces, and for albums edit properties and delete). The header stays as it is.
  - **Map**: opens the map view showing only that entry's photos.
  - **Information**: a dialog with the entry's statistics: number of photos, total size on disk, date range, how many are starred, geotagged and modified, and the folders, albums and people its photos belong to.
- New statistics API, `GET /api/photos/stats`, which takes the same filters as `GET /api/photos` and returns the totals for all matching photos, not only the first page.
- New **entry links**: wherever the UI names a library entry, meaning a folder, album, tag or person, it shows the entry's icon and links to it. Choosing the link opens that entry in the library. This covers the photo Info panel (folder, albums, tags, people) and the Information dialog. A link is shown only when the active level offers that entry's sidebar list; otherwise the entry is shown as plain text.
- Photo cards in every skin show a **modified** mark on the thumbnail when the photo has saved edits. The mark has a tooltip and an accessible name in the active language.

## Capabilities

### New Capabilities
- `library-entries`: the sidebar entry menu and its items, the entry Information dialog and the statistics API behind it, and links to library entries (icon plus navigation) used across the UI.

### Modified Capabilities
- `app-settings`: the Settings view gains a Plugins section, and its section order changes.
- `plugins`: the Plugins view becomes a Plugins section of Settings and is no longer opened from the top bar.
- `localization`: the language switcher exists only in the Settings view's Language section, not in the top bar.
- `complexity-levels`: the level table drops the top-bar language switcher and the Plugins view, and adds the entry menu, its items and the Plugins section. Unlocked Settings at Child show only the sections allowed at Child.
- `skins`: the list of views every skin offers drops Plugins and adds the entry menu, and the Classic top bar no longer has a language choice.
- `photo-info`: the folder, albums, tags and people in the panel are shown as entry links.
- `photo-grid`: a card shows a modified mark for a photo with saved edits.
- `basic-filters`: the fresh-install scenario refers to the Plugins section of Settings instead of the Plugins view.

## Impact

- Client: `shell/navigation.ts` (drop `plugins`), all three skins' navbars, sidebars and photo cards, `components/SettingsView.tsx` (embeds the plugins list from `components/PluginsView.tsx`), `components/LanguageSwitcher.tsx` (no longer used in a top bar), `App.tsx` (no `plugins` view), `components/viewer/InfoPanel.tsx`, `levels/controls.ts`, the locale files, and new components for the entry menu, the Information dialog and entry links.
- Server: a new route and service for photo statistics that reuses `photoFilters`, with tests.
- Shared: new `PhotoStats` type in `shared/types.ts`.
- Docs: `docs/complexity-levels.md` and `docs/skins-and-themes.md` where they mention the Plugins view or the top-bar language switcher.
- No change to files in the photo folders. The statistics are read-only.
