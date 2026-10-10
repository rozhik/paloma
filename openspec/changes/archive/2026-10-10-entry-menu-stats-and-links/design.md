# Design

## Context

- Navigation: `client/src/shell/navigation.ts` lists the views (`library`, `people`, `map`, `collage`, `plugins`, `settings`), and every skin's navbar renders them. The Classic navbar also renders `LanguageSwitcher` behind the `languageSwitcher` control. `App.tsx` maps `plugins` to `PluginsView`.
- Settings: `SettingsView.tsx` already has a Language section (`LanguageSection`) and a Level section, then the skin, theme and viewer-bar sections.
- Sidebar: `shell/sidebar.tsx` builds `SidebarSectionData`/`SidebarItem` for all skins. Each skin renders an item as a single `<button>` (`ClassicSidebar` `Entry`, `CompactEntry`, `GlassEntry`), with the count badge inside it.
- Grid headers: `LibraryHeader`, `AlbumHeader`, `TagHeader`, `MemoryHeader` and `PersonHeader` hold `FaceDetectionButton`, `SlideshowButton` and, for albums, Properties and Delete. All of them take the grid's `photos`.
- Photos API: `GET /api/photos` uses `photoFilters()` (hidden photos are excluded by default) and has a default `limit` of 500. The client builds the query with `libraryQueryParams(selection)`.
- Info panel: `components/viewer/InfoPanel.tsx` shows albums as plain `<li>` items and people with an avatar, and tags through `TagChips`. `PhotoInfo` has `albums: {token, name}[]`, `people` and `photo.folderId`.
- Cards: `ClassicPhotoCard` shows a `Sliders` icon in the caption when `photo.edits` is truthy. `SquarePhotoCard` (Compact, Glass) shows it in a small overlay together with the location pin.

## Goals / Non-Goals

**Goals:**
- One shared model for "a library entry", so the menu, the Information dialog and entry links behave the same in every skin.
- Statistics over the whole selection, computed in SQL, without loading photo rows into the client.

**Non-Goals:**
- No change to the grid headers, the map view itself, or the album/person editing dialogs. They are reused as they are.
- No disk-usage scan. The total size is the sum of the `fileSize` stored by the scanner, not a fresh `stat` of each file.
- No video- or format-specific statistics.

## Decisions

### 1. `LibraryEntry` as the shared descriptor
Add `client/src/shell/entries.ts` with:
```ts
type LibraryEntry =
  | { kind: 'shortcut'; filter: FilterType } | { kind: 'memory'; memory: MemorySelection }
  | { kind: 'album'; token: string } | { kind: 'tag'; name: string }
  | { kind: 'person'; id: string } | { kind: 'folder'; id: number };
```
along with `openEntry(entry)` (calls the existing store setter: `setSelectedAlbum`, `setSelectedTag`, ...), `entrySelection(entry)` (a `LibrarySelection` for `libraryQueryParams`, with empty search text), `entryIcon(kind)` (the same icons and colours as `sidebar.tsx`) and `entryListAllowed(level, kind)` (maps to `sidebar.<list>` and, for persons, `people.choose`). `SidebarItem` gains an optional `entry` field. The Unrecognized item has none, so it gets no menu.
*Alternative:* pass callbacks per item. Rejected, because links and the Information dialog need to describe entries that are not in the sidebar's item list.

### 2. Entry row = select button + menu button (siblings)
Each skin's entry becomes a row container holding the existing select button and a new `EntryMenuButton` after the count. A button cannot be nested in a button, which is why they are siblings. The menu is a React Bootstrap `Dropdown` with `autoClose`, rendered in a portal so the sidebar's overflow does not clip it. Its items are built by one shared hook, `useEntryMenuItems(entry)`, so every skin offers the same items at the same levels. Each skin only styles the trigger: Classic is large, Compact uses `IconButton` at 24px or more, Glass uses 44px or more. In Glass, opening the menu must not count as an outside tap that closes the sidebar panel. The menu's portal target is marked so that `GlassSidebar`'s outside-click handler ignores it.
In Compact's collapsed strip, entries show no menu.

### 3. Menu actions fetch the entry's photos on demand
Slideshow and Find faces need `Photo[]`. The menu fetches `GET /api/photos?<entrySelection>` with the same default page as the grid (500), so it plays what the grid would show.
- **Slideshow**: the click handler first calls `enterFullscreen()` synchronously, because full screen is only allowed during the user gesture, as in `SlideshowButton`. It then awaits the fetch and calls `startSlideshow(photos, 0)`. An empty result exits full screen and does nothing.
- **Find faces**: reuses the runner that `FaceDetectionButton` uses (`faces/detectionRunner.ts`) with the fetched photos.
- **Edit properties / Delete** (albums): extract the modal and delete-confirm logic out of `AlbumHeader` into a reusable `useAlbumActions(token)` plus its modals. Both the header and the menu use it.
- **Map**: `openEntry(entry)` and then `setCurrentView('map')`. `PlacesMap` already follows the current selection.
- **Information**: opens `EntryInfoDialog` for the entry.
*Alternative:* select the entry first and then use the header buttons. Rejected, because the user chose to keep the current grid while acting on another entry.

### 4. Statistics API in SQL
New `server/src/services/photoStats.ts`, exporting `photoStats(query)`, and the route `GET /api/photos/stats`. It is registered before `/photos/:id/...` and validated with `invalidDateFilter` like `/photos`. It reuses `photoFilters(query)` as the WHERE clause and runs a few aggregate queries through `db/query.ts` `all`/`get`, following `docs/server-data-layer.md`:
- totals: `count(*)`, `sum(fileSize)`, `min/max(dateTaken)`, a count of null `dateTaken`, a count of `isStarred`, a count of non-null `latitude`;
- modified: a count of matching photos that have an `edits` row whose chain parses to at least one step. To count this in SQL rather than parse every row, the condition is `editInstructionsJson` not null and not `'[]'`. Saving an empty chain must store null or delete the row. This is checked in tasks, and normalised if it does not hold;
- `folders`: a group by `folderId` joined to `folders`;
- `albums`: a group by `albumPhotos.token`, with names from `shownAlbumTexts`;
- `people`: a group by `photoPeople.contactId`, restricted to `shownPeople`, with the shown names.
The response type `PhotoStats` goes in `shared/types.ts`. Size formatting stays on the client and reuses `fileSizeText` from `viewer/infoFormat.ts`.
*Alternative:* compute on the client from `GET /api/photos`. Rejected, because the page limit of 500 would give wrong totals.

### 5. Entry links
A new `EntryLink` component takes `{ entry, label, placeholder? }`. It renders the entry icon and the label, as a `<button class="btn btn-link">` when `entryListAllowed`, otherwise as a `<span>`. On click it calls `closeViewer()`, an `onNavigate` callback (the dialog closes itself), `setCurrentView('library')` and `openEntry(entry)`. It is used in:
- `InfoPanel`: the folder in the File section (`photo.folderId`, with the folder name from `folderPath`), albums, and person names in `PeopleSection` (the avatar stays, the name becomes the link);
- `TagChips`: in the Info panel only, the chip label becomes a tag link through a new optional `linkTags` prop. `AddTagsModal` keeps plain chips;
- `EntryInfoDialog`: the folders, albums and people lists.

### 6. Plugins and language move into Settings
- Remove `plugins` from `NAV_ITEMS`, from `AppView` and from the `App.tsx` content map, and remove `view.plugins` from `CONTROL_LEVELS`. Add `settings.plugins: 'normal'`. A stored `currentView: 'plugins'` (the store is not persisted; checked in tasks) falls back to library.
- Split `PluginsView` into `PluginsList` (the body) and render it as the last `SettingsView` section, under `useAllows('settings.plugins')`.
- Remove `LanguageSwitcher` from `ClassicNavbar` and from the Compact and Glass navbars if they render it. Remove the `languageSwitcher` control id and delete `LanguageSwitcher.tsx` if nothing else uses it. `LanguageSection` stays.
- Add control ids `entry.menu` (`child`) and `entry.info` (`easy`). The Map item uses `view.map`, and Slideshow, Find faces and the album actions keep their existing ids (`slideshow`, `faces.detect`, `album.editProperties`, `album.delete`).

### 7. Modified mark
A shared `ModifiedMark` (a `Sliders` icon with `title` and `aria-label` set to `t('photo.edited')`) sits absolutely positioned at the bottom-start corner of the thumbnail in `ClassicPhotoCard` and `SquarePhotoCard`. It is shown when `photo.edits?.length > 0`, and replaces the caption icon in Classic and the overlay icon in the square card. The location pin stays where it is. The grid refreshes after a save (`libraryVersion`), so the mark follows saved edits.

### MVP code reused, rewritten or dropped
- Reused: `libraryQueryParams`, `photoFilters`, `shownAlbumTexts`, `shownPeople`, `fileSizeText`, `SlideshowButton`'s full-screen handling, `detectionRunner`, `PluginsView` body, `LanguageSection`, `Sliders` mark.
- Rewritten: sidebar entry rendering in all three skins (row with two buttons), `AlbumHeader` (actions extracted), `InfoPanel` albums, people and file sections, `TagChips` (optional links), card marks.
- Dropped: Plugins nav item and view route, top-bar `LanguageSwitcher`, `languageSwitcher` and `view.plugins` control ids.

### Files in the photo folders
None are read or written. Statistics come only from the SQLite library. Navigation and the menu read the existing APIs. Delete and Edit properties from the menu write exactly what the album header writes today, as defined in the albums capability: the album definition in the affected folders' `.paloma.json`.

## Risks / Trade-offs

- [The menu's fetch adds latency before a slideshow starts] → Show a spinner on the menu item. A full-screen request that has already been made is exited if the fetch fails or returns nothing.
- [`totalSize` reflects the size at the last scan, not the current disk] → This is acceptable for the Information dialog. The design states it, and the label says "Size" without claiming it is live.
- [Large libraries: grouping by folder or person over "All photos" lists everything] → The dialog's lists scroll, and the queries are aggregates over indexed columns.
- [Users used to the top-bar language switcher] → The Language section is first in Settings, and Settings stays in the navbar at every level.
- [Two buttons per entry change keyboard order] → The menu button follows its select button in the tab order, and arrow-key navigation is not added. This is the same as the other icon buttons.

## Migration Plan

This is a client and API change only, with no data migration. The stored UI settings keep working, because a removed control id does not appear in storage. To roll back, revert the change.
