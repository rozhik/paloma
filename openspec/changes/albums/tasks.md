# Tasks

## 1. Types and library tables

- [x] 1.1 In `shared/types.ts`:
  - add `PalomaAlbumDefinition` (`name?`, `date?`, `location?`, `description?`, `cover?`, `modified?`, index signature)
  - add `albums?` to `PalomaFolderFile` and `PalomaPhotoEntry`
  - add `albums: string[]` to `Photo`
  - change `Album` to `{ token, name, date, description, location (all string | null), photoCount, coverPhotoId: number | null, coverThumbnailUrl: string | null }`

  Verify that `npm run build` type-checks after the remaining references compile; temporary stubs are allowed until groups 3–5.
- [x] 1.2 Replace the MVP `albums`/`album_photos` with `folder_albums` (including `cover`) and token-based `album_photos` (plus the token index) in `db/schema.ts` and `db/index.ts`. Add an in-place migration in `db/columns.ts` that drops the MVP `albums` table and an `album_photos` that has `album_id`. Verify with a `columns.test.ts` case: an in-memory database with the MVP tables and rows ends up with the new tables, it is idempotent, and `photos` rows are untouched.

## 2. Picasa ini album parsing

- [x] 2.1 Extend `parsePicasaIni`/`readPicasaIni` to return `albums` from `[.album:<token>]` sections (`name`, `date`, `location`, `description`, verbatim, `token=` and other keys ignored, empty section → `{}`), and `albums` in `PhotoFields` from `albums=` (split on `,`, empty items and duplicates dropped). Verify with `picasaIni.test.ts` cases:
  - a full album section
  - a token-only section
  - a name with leading and double spaces
  - `albums=a,,a,b`
  - `name_lh` ignored
  - a repeated `.album` section ignored after the first

## 3. Sidecar album data

- [x] 3.1 In `SidecarService`:
  - make `albums` that is not an object of objects `unreadable`
  - read `albums` in `fieldsOf` (array of non-empty strings, de-duplicated; any other type counts as absent)
  - add `'albums'` to `SUPPORTED_FIELDS` and `sameFields`

  Verify with tests: `"albums": ["x"]` is unreadable and the file is unchanged; `"albums": "x"` in an entry counts as absent and is preserved.
- [x] 3.2 Change `FolderState` to `{ photos, albums }`. `getFolderState` returns sidecar definitions, or live `.ini` definitions when there is no sidecar, and empty for an unreadable sidecar. Update the callers in `FolderScannerService` and `photoApi` without changing their behavior. Verify that the existing scanner, sidecar and API tests pass, plus a new test: an `.ini`-only folder with an album returns the definition and membership and writes nothing.
- [x] 3.3 Extend `reimport` with the definition step from design.md: replace unmodified definitions, add new ones, keep `modified` ones, never remove any. Verify with tests:
  - a Picasa rename updates an unmodified definition
  - a Paloma-renamed definition is kept
  - a definition missing from the `.ini` survives
  - unknown definition keys survive
  - memberships of unmodified entries follow the `.ini`
- [x] 3.4 Split the write path into `updateFolderSidecar(dir, mutate)` and `changeEntry(data, filename, edit)`, and reimplement `updatePhotoFields` on them. The first-import base now includes `.ini` album definitions. Verify that all existing `updatePhotoFields` tests pass unchanged. Add a test: starring a photo in an `.ini` folder with albums imports the definitions without `modified` and the memberships.
- [x] 3.5 Implement the pure album mutations from design.md (create with optional description and location, add with a definition copy without `cover`, remove, edit writing the whole shown definition, cover set and reset, delete across all entries) and the token and local-offset date helpers. Verify with unit tests on in-memory `PalomaFolderFile` objects:
  - `modified` is set on the changed entries and definitions
  - the empty-entry rule applies with and without `iniHash`
  - delete clears the token from entries for missing files
  - unknown keys are preserved
  - an edit writes the shown name/date/description/location into a copy that had a stale name
  - an empty description or location deletes the key
  - `cover` is set only in the cover photo's folder and removed from the other copies
  - the token matches `/^[0-9a-f]{32}$/`
  - the date matches `YYYY-MM-DDTHH:mm:ss±HH:MM`

## 4. Library indexing of albums

- [x] 4.1 In `FolderScannerService`:
  - write `folder_albums` when a folder state is first loaded during a scan
  - write `album_photos` in `indexPhoto` on insert and on a content change
  - replace both for the folder in `applyFolderState`, in one transaction
  - delete `folder_albums` in `pruneFolders`

  Update the test table cleanup list. Verify with `FolderScannerService.test.ts` tests:
  - the library is rebuilt from `.paloma.json` with an album spanning two folders
  - an `.ini`-only album appears with no file written
  - a hand edit that adds a token to an entry shows up without a restart
  - an unreadable sidecar contributes no albums
  - a pruned folder leaves no `folder_albums` rows

## 5. Album API

- [x] 5.1 Implement `resolveAlbum(copies)` and `listAlbums()` in `server/src/services/albumApi.ts`. Verify with `albumApi.test.ts` tests:
  - the newest `modified` wins over a path-earlier copy
  - with no `modified`, the first named copy by path wins
  - an all-unnamed album gives `name: null` and is sorted last
  - the count excludes hidden photos
  - a definition without members is not listed
  - the default cover is the first non-hidden member
  - a chosen cover wins while it is a non-hidden member, and falls back to the default when it is removed or hidden
  - the list returns `description`, `location` and `coverPhotoId`
- [x] 5.2 Add `album` to `listPhotos` and `albums` to `toApiPhoto`. Verify with `photoApi.test.ts` tests: `?album=T` returns members from two folders, hidden members are excluded unless `includeHidden=true`, and every photo has `albums`.
- [x] 5.3 Implement the multi-folder runner (validation → 400, unknown token or photo → 404, unreadable pre-check → 409 with nothing written, per-folder write then `applyFolderState`, partial failure → 500 with `failedFolders`) and the five operations on it. Verify with `albumApi.test.ts` tests against temp folders:
  - create across two folders writes both sidecars with the same token and name
  - add from a new folder copies the definition
  - removing the last photo unlists the album
  - rename reaches every defining folder and an `.ini`-only folder (creating `.paloma.json`, `.ini` bytes unchanged)
  - setting and clearing description and location
  - `coverPhotoId` of a member is stored in that folder only, a non-member → 400, `null` resets it
  - the cover survives a library rebuild from disk
  - delete removes the definitions and the tokens everywhere, and all photos stay
  - a corrupt sidecar in one folder → 409 and no file changed
  - a read-only folder → 500 naming it, while the other folder is written
  - an empty name, empty `photoIds`, an empty PATCH body or a wrong type → 400
- [x] 5.4 Replace the MVP album routes in `routes/index.ts` with the routes in design.md's API table, and pass `album` through `GET /api/photos`. Verify by grep that no route uses numeric album ids. Add a route-level test or a `curl` check that `DELETE /api/albums/:token/photos` reads its JSON body.
- [x] 5.5 Add a test that a deleted album stays unlisted after the folder's `.picasa.ini` changes without new members, and comes back when the `.ini` adds an unmodified member.

## 6. UI

- [x] 6.1 Add `selectedAlbumToken`/`setSelectedAlbum` and `libraryVersion`/`bumpLibrary` to `usePalomaStore`, with selecting an album, a folder and a filter mutually exclusive. Verify that `npm run build` type-checks and, in the running app, that clicking a folder after an album clears the album selection.
- [x] 6.2 Add the "Альбоми" section to `LeftSidebar`: the list with counts, untitled albums as "Без назви", the empty state, the active highlight, and refetching on the poll and on `libraryVersion`. Verify in the running app with a Picasa folder that has albums.
- [x] 6.3 Fetch `/api/photos?album=T` in `App` when an album is selected, and add `AlbumHeader` with the name, description, location, count, an `AlbumPropertiesModal` (name, description, location), and delete behind a Bootstrap confirmation modal. Reset the selection when the album disappears, and show API errors in an `Alert`. Verify in the running app: editing the name, description and location updates the sidebar and the header, clearing the location hides it, cancelling delete keeps the album, and confirming delete removes it.
- [x] 6.4 Add `AlbumPickerModal` (existing albums, or a new album name) and "До альбому" to `PhotoTray`, plus "Прибрати з альбому" when an album is selected and "Зробити обкладинкою" when an album is selected and exactly one photo is in the tray. Bump the library and clear the tray on success, and show errors (including `failedFolders`) in the modal. Verify in the running app: creating `Trip` from two selected photos shows `Trip (2)`, adding photos from another folder raises the count, removing one lowers it, and making a photo the cover changes the sidebar cover.

## 7. Integration check

- [x] 7.1 Run the app with `PALOMA_PHOTOS_DIRS` pointing at a copy of real Picasa folders that share an album.
  - Confirm the album shows under its name with photos from all folders, and no `.paloma.json` is created.
  - Rename it, set a description and a cover in the UI, and confirm every folder's `.paloma.json` has the new name and description with `modified`, only the cover's folder has `cover`, and every `.picasa.ini` is byte-identical.
  - Delete the database, restart, and confirm the album, its photos and its cover are restored from disk.
- [x] 7.2 Verify that `npm run build` and `npm test` pass.
