# Tasks

## 1. Plugins and language move into Settings

- [x] 1.1 Split `client/src/components/PluginsView.tsx` into a reusable `PluginsList` body. Render it as the last section of `SettingsView` under a new `settings.plugins` control (`normal`) in `levels/controls.ts`. Verify by extending the SettingsView/controls tests: the section is last at Normal and absent at Easy and Child.
- [x] 1.2 Remove `plugins` from `NAV_ITEMS`, the `AppView` type, the `App.tsx` content map and `view.plugins` in `CONTROL_LEVELS`. Make sure the store cannot keep `currentView: 'plugins'`. Verify by updating `shell/shell.test.ts` and `appearance/skins/skins.test.tsx`: no skin's navigation renders Plugins at Developer.
- [x] 1.3 Remove the top-bar `LanguageSwitcher` from the Classic, Compact and Glass navbars. Drop the `languageSwitcher` control id, and delete `components/LanguageSwitcher.tsx` if it is unused. Verify with a skins test that no top bar has a language switcher at any level, and that the Settings Language section still switches the language.
- [x] 1.4 Remove now-unused `nav.plugins` / switcher locale keys from every catalog, or keep them where Settings reuses them, and add the Plugins section heading. Verify with `i18n/catalogs.test.ts`.
- [x] 1.5 Update `docs/complexity-levels.md` (Easy no longer has the top-bar language switcher; Normal has the Settings Plugins section instead of the Plugins view) and verify `appearance/docs.test.ts` and any docs test still pass.

## 2. Photo statistics API

- [x] 2.1 Add `PhotoStats` (and its folder/album/person item types) to `shared/types.ts`.
- [x] 2.2 Check that `PUT /api/photos/:id/edits` with `[]` leaves no `edits` row or a null chain. If it does not, normalise it so that "modified" can be counted in SQL. Verify with a test in `server/src/routes/edits.test.ts`.
- [x] 2.3 Implement `server/src/services/photoStats.ts`, which uses `photoFilters` and aggregate queries through `db/query.ts`, following `docs/server-data-layer.md`. Cover it with `server/src/routes/stats.test.ts` (route and service together): totals over more than 500 photos, hidden photos excluded, `modifiedCount` only for non-empty chains, date range and `undatedCount`, folder/album/person lists sorted by count then name with shown names, and an empty selection.
- [x] 2.4 Register `GET /api/photos/stats` before the `/photos/:id` routes, with the `invalid_date` check. Add a client `fetchPhotoStats(selection)` in `client/src/api/library.ts`. Verify with a route test that checks the 200 body and the 400 `invalid_date` response, and with a test that no file in the photo folders changes.

## 3. Library entries, links and the Information dialog

- [x] 3.1 Add `client/src/shell/entries.ts` with the `LibraryEntry` type, `openEntry`, `entrySelection`, `entryIcon` and `entryListAllowed`, and add an optional `entry` to `SidebarItem` in `shell/sidebar.tsx`. The Unrecognized item has none. Verify with `entries.test.ts`, which checks the selection params per kind and the level gating per kind.
- [x] 3.2 Add the `EntryLink` component: it shows the icon and label, is a button when allowed and a span otherwise, and when chosen it closes the viewer, goes to the library and opens the entry. Verify with `EntryLink.test.tsx`, which covers navigation, the Enter key, the plain text when not allowed, and a closed viewer.
- [x] 3.3 Add `EntryInfoDialog`: it shows the statistics in the active language's number, date and size formats, and the folder/album/person lists as `EntryLink`s, leaving out empty lists and the list of the entry's own kind. Verify with a test that uses a mocked `fetchPhotoStats`.
- [x] 3.4 Add the locale strings for the dialog, the menu items and the menu button's accessible name (with the entry name) to every catalog. Verify with `i18n/catalogs.test.ts`.

## 4. Entry menu in the sidebar

- [x] 4.1 Extract the album Properties and Delete logic from `AlbumHeader` into a reusable hook with its modals. `AlbumHeader` keeps working as before. Verify that the existing album tests still pass.
- [x] 4.2 Implement `useEntryMenuItems(entry)` with Slideshow (full screen first, then fetch the entry's photos and start), Find faces (through `detectionRunner`), the album's Edit properties and Delete, Map (open the entry, then `view` `map`) and Information, each filtered by its control level. Add `entry.menu` (`child`) and `entry.info` (`easy`) to `CONTROL_LEVELS`. Verify with tests: the items per level (Child: only Slideshow; Easy: also Information; Normal: all), a slideshow from the menu that keeps the current selection, and Map that opens the map with the entry selected.
- [x] 4.3 Add `EntryMenuButton` (a portal dropdown that closes on Esc or an outside click and whose accessible name names the entry). Change the Classic, Compact and Glass sidebar entries into a row with the select button and the menu button after the count, at each skin's minimum target size. The collapsed Compact strip shows no menu. In Glass, opening the menu does not close the sidebar panel. Verify with a skins test: every skin renders a menu button for album entries and none for Unrecognized, and opening it does not change the selection.

## 5. Links in the Info panel

- [x] 5.1 In `InfoPanel`, show the folder (File section), the albums and the person names as `EntryLink`s. Verify by extending `InfoPanel.test.tsx`: choosing album `Trip` closes the viewer and opens the album.
- [x] 5.2 Add an optional `linkTags` mode to `TagChips` and use it in the Info panel. The remove button still removes the tag without navigating. Verify by extending `TagChips.test.tsx`.

## 6. Modified mark on photo cards

- [x] 6.1 Add a shared `ModifiedMark` (an icon with a tooltip and an accessible name from `photo.edited`) at the bottom-start corner of the thumbnail in `ClassicPhotoCard` and `SquarePhotoCard`. It is shown only when `photo.edits` has at least one step, and replaces the caption and overlay icons. Verify with a skins test that the mark appears for an edited photo in all three skins and not for an unedited photo or for `edits: []`.

## 7. Integration

- [ ] 7.1 Run the app (`npm run dev`) and check by hand: there are no Plugins or language controls in the top bar of any skin, the Plugins section is in Settings, an album's menu shows its slideshow, map and Information, the links in Information and Info open their entries, and the modified mark shows on an edited photo.
- [x] 7.2 Run `openspec validate entry-menu-stats-and-links --strict`, `npm run build` and `npm test`, and verify that all pass.
