# Design

## Context

See proposal.md (Why). The behavior is defined in `specs/albums/` and in the `specs/sidecar-files/` delta. The Picasa source format is `docs/picassa/07-picasa-ini-format.md` §2.2 and §3 (`albums=`). This change adopts the album shape proposed in `docs/picassa/08-paloma-json-format.md` §3.2: a top-level `albums` keyed by token, and `photos.<name>.albums` as an array of tokens. It adds one thing 08 does not have: `modified` on album definitions.

Current state, all from the archived `sidecar-files-basics` change:
- **`picasaIni.parsePicasaIni`** skips `[.album:*]` sections and ignores the `albums=` key.
- **`SidecarService`**:
  - validates `photos` and `iniHash`, and preserves every other top-level key untouched, including `albums`
  - `getFolderState(dir)` returns `Record<filename, PhotoFields>`
  - `updatePhotoFields` does the read → reconcile/import → patch → atomic-write sequence for one photo
  - `reimport` touches only `star`, `hidden`, `caption` and `keywords`
- **`FolderScannerService`** caches the `FolderState` per folder and applies it to `photos` columns in `indexPhoto` and `applyFolderState`. It removes `album_photos` rows when photos are removed.
- **MVP albums.**
  - `albums` has an autoincrement `id`, `name`, `description` and `created_at`.
  - `album_photos` has `album_id`, `photo_id` and `added_at`.
  - Routes: `GET /albums`, `POST /albums` and `POST /albums/:id/photos`, all database-only.
  - `shared/types.ts` `Album` has a numeric `id`.
  - The client has no album UI.
- **Client.**
  - Plain `fetch` and Zustand.
  - `LeftSidebar` polls `/api/folders` every 5 s.
  - `App` fetches `/api/photos` with folder and filter params.
  - `PhotoTray` holds the selected `Photo` objects.
  - UI strings are Ukrainian.

## Goals / Non-Goals

**Goals:**
- Albums use the same single owner as the photo fields. `SidecarService` is the only code that reads or writes album data in folder files. The database is a cache rebuilt from it.
- One album operation reads and writes each affected folder exactly once, through the same atomic write path as photo fields.

**Non-Goals:**
- No user-defined photo order inside an album. Picasa keeps it in `.pmp`, not in `.ini`. Album photos use the normal photo-list order.
- No collage as the album cover. The cover is one photo of the album.
- No sync with Picasa Web Albums / Google Photos. Sync is left to future plugins. `name_lh`, `IIDLIST_*` and `[photoid]` are not imported, and unknown keys in JSON definitions are preserved for those plugins.
- No per-section `.ini` hashes. The single `iniHash` stays.
- No undo for album deletion.
- `PATCH /api/photos/:id` gets no `albums` key. Membership changes go through the album endpoints only.

## Decisions

### Files touched in user photo folders

| File | Read | Written |
| :--- | :--- | :--- |
| `<folder>/.paloma.json` | As today: scan/index, watcher events, before every change. Also before every album operation, for every affected folder (pre-check and write) | On album create, edit, delete, add and remove, in each affected folder, created if absent. On `.ini` re-import as today |
| `<folder>/.paloma.json.<pid>.<random>.tmp` | Never | During each write, renamed onto `.paloma.json`, removed on failure |
| `<folder>/.picasa.ini`, `<folder>/picasa.ini` (any case) | As today, now also for `[.album:*]` and `albums=` | Never |
| Photo files, `.picasaoriginals/**` | Not for album purposes | Never |

"Affected folders" for an operation on token `T`:
- **create and add:** the folders of the given photos.
- **remove:** the folders of the given photos that are members.
- **edit and delete:** every library folder that has a `folder_albums` row for `T` or a photo in `T`.

### Folder file model

`PhotoFields` gains `albums?: string[]` (non-empty, de-duplicated, order kept). `'albums'` joins `SUPPORTED_FIELDS`, so these already handle membership with no new logic:
- `fieldsOf`
- the empty-entry rule
- `reimport` for entries without `modified`
- the conflict log, through `sameFields`

`fieldsOf` reads `albums` only as an array: it keeps the non-empty strings and drops duplicates. Any other type counts as absent and is preserved.

New `AlbumDefinition = { name?, date?, location?, description?, cover?, modified?, [key]: unknown }`. The `.ini`-mapped keys are `name`, `date`, `location` and `description`. `cover` is Paloma-only: the file name of the cover photo, stored only in the copy in that photo's folder.

`FolderState` changes from a bare map to `{ photos: Record<string, PhotoFields>; albums: Record<string, AlbumDefinition> }`. The callers that change with it are `FolderScannerService.indexPhoto`, `applyFolderState` and `photoApi.updatePhoto`.

*Alternative considered:* a separate `getFolderAlbums(dir)` call. We rejected it because the scanner and the watcher would then read and reconcile each folder twice, and both reads must come from one consistent snapshot.

### Validation

- `readFolderSidecar` adds one more `unreadable` case: `albums` that is present but not a plain object whose values are all plain objects. This matches the existing `photos` rule.
- Inside a definition, a mapped key that is not a string is ignored for the library and preserved.
- `modified` counts only as a string.

### Picasa ini parsing

`parsePicasaIni` returns `{ sections, albums }`.
- **`albums`.** For every `[.album:<token>]` section, the mapped keys are copied verbatim (untrimmed, first occurrence wins). `token=` and other keys are ignored. A section with no mapped keys gives `{}`. The token is the text after `.album:`, kept as-is.
- **Membership.** A file section's `albums=` is split on `,`, with empty items and duplicates dropped, into `PhotoFields.albums`.

`readPicasaIni` passes both through. `matchSections` keeps working on `sections` only.

### Import and re-import

- **First import** (`updatePhotoFields` base and the new album write path) builds `albums` from the `.ini` definitions without `modified`. The `albums` key is written only if the `.ini` has album sections.
- **Live view** (`getFolderState` with no sidecar) returns the `.ini` albums and memberships.
- **`reimport(data, imported, iniAlbums, iniHash)`** adds a definition step:
  - For each `.ini` token: if the JSON definition has `modified`, keep it.
  - Otherwise, delete its mapped keys, assign the `.ini` values, and keep its other keys.
  - If the definition is missing, add it.
  - JSON definitions whose token is not in the `.ini` are left alone. Never removing a definition makes a copy that Paloma added to an imported folder safe from re-import, and an orphan definition is harmless because albums are listed only through members.

### One write path for all folder changes

`updatePhotoFields` is split into:
- `updateFolderSidecar(dir, mutate: (data: PalomaFolderFile) => void)`. It reads (throwing `SidecarUnreadableError`), builds the base (reconciled sidecar, or `.ini` import, or empty), runs `mutate` on a copy, and writes atomically.
- `changeEntry(data, filename, edit: (entry) => void)`. It applies `edit`, sets `modified`, and applies the empty-entry rule.

`updatePhotoFields` becomes a thin wrapper. Album mutations are pure functions over `PalomaFolderFile`, so they are unit-testable without disk:

| Operation | Mutation in a folder |
| :--- | :--- |
| create | `albums[T] = { name, date, description?, location?, modified }`. Each given photo's entry gets `T` appended to `albums` through `changeEntry` |
| add | If `albums[T]` is absent, copy the shown definition (all its keys except `cover`, including `modified` if present). Append `T` to each given photo that lacks it |
| remove | Drop `T` from each given photo's `albums` (clearing the key when empty) through `changeEntry` |
| edit | `albums[T] = { ...albums[T], ...shown, ...patch, modified }`, where `shown` is the resolved `name`/`date`/`description`/`location`. An empty `description`/`location` deletes the key. For a cover change, set `cover` in the cover photo's folder and delete it everywhere else; `coverPhotoId: null` deletes it everywhere |
| delete | Delete `albums[T]`. For every entry in `photos` whose `albums` has `T` (including entries for missing files), drop it through `changeEntry` |

**Every edit writes the whole shown definition.** Without this, a cover change would bump `modified` on a copy that still has a stale name, and that stale name would win name resolution. Writing the shown fields into every affected copy, with one shared `modified`, keeps all copies identical apart from `cover`.

Shared timestamps:
- `date` on create is the current local time with offset, `YYYY-MM-DDTHH:mm:ss±HH:MM`, matching Picasa.
- `modified` is UTC ISO 8601, like photo entries.
- One operation uses one timestamp for every folder it writes, so the copies agree.

The new token is `crypto.randomBytes(16).toString('hex')`.

### Multi-folder operations (`albumApi.ts`)

1. Validate the body: a `name` that is a string with a non-space character, `photoIds` that is a non-empty array of integers, `description`/`location` as strings, and `coverPhotoId` as an integer that is a member of the album, or `null`. An edit must carry at least one key. Otherwise return 400. Resolve the token and photo ids against the library: an unknown token or photo returns 404. For add, remove, edit and delete, the token must be listed, meaning it has at least one member in the library.
2. Compute the affected folders, sorted by path.
3. **Pre-check.** Run `readFolderSidecar` on each. If any is `unreadable`, return 409 naming those files, with nothing written.
4. For each folder, run `updateFolderSidecar(dir, mutation)`, then `applyFolderState(dir, getFolderState(dir))`. On an error, log it with the folder and continue with the next folder.
5. If any folder failed, return 500 `{ error, failedFolders }`. Otherwise return 200 with the album (create, edit, add, remove) or `{ success: true }` (delete).

Everything is synchronous, as with photo fields, so two requests cannot interleave. Continuing past a failed folder, instead of stopping, means an edit reaches every writable folder. Resolution then shows the new values, because those copies carry the newest `modified`.

*Alternative considered:* write all temp files first, then rename them all. A rename can still fail part-way, and an outside watcher would see the folders change at different times anyway. It adds complexity without real atomicity across folders.

### Library tables

The MVP tables are replaced:

```sql
CREATE TABLE folder_albums (
  folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  name TEXT, date TEXT, location TEXT, description TEXT, cover TEXT, modified TEXT,
  PRIMARY KEY (folder_id, token)
);
CREATE TABLE album_photos (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  PRIMARY KEY (photo_id, token)
);
CREATE INDEX album_photos_token ON album_photos(token);
```

**In-place migration** (`db/columns.ts` next to `addMissingPhotoColumns`): if `album_photos` has an `album_id` column, drop `album_photos`. Drop the MVP `albums` table if it exists. Then create the new tables. The old rows were database-only, so this loses only MVP albums (see BREAKING in proposal.md).

**Applying folder state:**
- `applyFolderState` replaces the folder's `folder_albums` rows and its photos' `album_photos` rows in the same transaction that sets the photo columns.
- `indexPhoto` writes the photo's `album_photos` rows on insert and on a content change.
- On a scan, the scanner writes a folder's `folder_albums` rows the first time it loads that folder's state into its cache.
- `removePhotos` keeps deleting `album_photos` by `photo_id`.
- Removing a folder in `pruneFolders` also deletes its `folder_albums`. Both are explicit deletes, as the existing code does not rely on the `foreign_keys` pragma.

*Alternative considered:* a `photos.albums` JSON column, like `keywords`. We rejected it because listing, counting and filtering by album need a join on token, and `json_each` on every photo list is slower and harder to index.

### Album resolution and listing

`resolveAlbum(copies)` is a pure function over `{ folderPath, name, date, location, description, cover, modified }[]`. It picks the copy that supplies `name`, `date`, `description` and `location`:
- Take the copy with the greatest `modified` (string compare of UTC ISO).
- Otherwise take the first copy by `folderPath` that has a non-empty `name`.
- Otherwise use the first copy by path with `name: null`.

`GET /api/albums`:
- Select the tokens that have `album_photos` rows.
- Load their `folder_albums` copies.
- Resolve each album, and count the non-hidden members.
- Pick the cover:
  - Use the chosen cover: among the copies with a `cover` (newest `modified` first, then path order), the first one whose file is a non-hidden member in that copy's folder.
  - Otherwise use the first non-hidden member by `date_taken DESC`.
  - Otherwise use any member.
- Sort by name (`localeCompare`, `sensitivity: 'base'`), with untitled albums last and ties broken by token.

`listPhotos` gains `album`, through an `EXISTS` on `album_photos`. `toApiPhoto` gains `albums: string[]`, filled with a single grouped query per list.

### API

| Route | Body | Result |
| :--- | :--- | :--- |
| `GET /api/albums` | — | `Album[]` |
| `POST /api/albums` | `{ name, photoIds, description?, location? }` | `Album` |
| `PATCH /api/albums/:token` | any of `{ name, description, location, coverPhotoId }` | `Album` |
| `DELETE /api/albums/:token` | — | `{ success: true }` |
| `POST /api/albums/:token/photos` | `{ photoIds }` | `Album` |
| `DELETE /api/albums/:token/photos` | `{ photoIds }` | `Album`, or `{ success: true, removed: true }` when the album has no photos left |
| `GET /api/photos?album=T` | — | `Photo[]` |

`shared/types.ts`:
- `Album` becomes `{ token: string; name: string | null; date: string | null; description: string | null; location: string | null; photoCount: number; coverPhotoId: number | null; coverThumbnailUrl: string | null }`.
- `Photo` gains `albums: string[]`.
- `PalomaPhotoEntry` gains `albums?: string[]`.
- `PalomaFolderFile` gains `albums?: Record<string, PalomaAlbumDefinition>`.

Error bodies are `{ error: string; failedFolders?: string[] }`.

### Client

- **Store.** `selectedAlbumToken: string | null` and `setSelectedAlbum(token)`. Selecting an album clears the folder and the filter, and selecting a folder or a filter clears the album. `libraryVersion` and `bumpLibrary()` let the sidebar and `App` refetch right after a mutation, instead of waiting for the 5 s poll.
- **`LeftSidebar`.** An "Альбоми" section above the folders. It fetches `/api/albums` with the folders, on the same 5 s poll and on `libraryVersion`. Each album is a list item with an icon, its name (or "Без назви") and a count badge. The empty state is "Альбомів ще немає".
- **`App`.**
  - When an album is selected, it fetches `/api/photos?album=T` and renders a new `AlbumHeader` above the grid: name, description, location, count, an "Властивості" button that opens a new `AlbumPropertiesModal` (name, description, location), and a Delete button.
  - Delete opens a React Bootstrap confirmation `Modal`, never `window.confirm`.
  - When the album disappears (its last photo is removed, or it is deleted), the selection resets to "all".
- **`PhotoTray`.**
  - Adds "До альбому", which opens a new `AlbumPickerModal`: a list of existing albums plus a "Новий альбом" name field. It calls POST create or add.
  - When an album is selected, it also shows "Прибрати з альбому" (DELETE photos), and, with exactly one photo selected, "Зробити обкладинкою" (`PATCH` with `coverPhotoId`).
  - On success it bumps the library and clears the tray.
- **Errors.** API errors (including `failedFolders`) are shown in a Bootstrap `Alert` inside the modal or header. The shown data refreshes only on success.

### MVP code: reused, rewritten, dropped

- **Reused, extended:** `picasaIni.ts`, `SidecarService.ts` (validation, `fieldsOf`, `reimport`, `getFolderState` shape, write path split), `FolderScannerService.ts` (`applyFolderState`, `indexPhoto`, `removePhotos`, `pruneFolders`), `photoApi.ts` (`listPhotos`, `toApiPhoto`, `updatePhoto` for the new `FolderState` shape), `db/columns.ts`.
- **New:** `server/src/services/albumApi.ts` (resolution, listing, the five operations) with `albumApi.test.ts`, `client/src/components/AlbumPickerModal.tsx`, `client/src/components/AlbumHeader.tsx`, `client/src/components/AlbumPropertiesModal.tsx`.
- **Rewritten:** the album routes in `routes/index.ts`, the album tables in `db/schema.ts` and `db/index.ts`, and `Album` in `shared/types.ts`.
- **Dropped:** the MVP `albums` table, `album_photos.album_id`/`added_at`, numeric album ids, and `POST /api/albums/:id/photos`.

## Risks / Trade-offs

- **[Partial multi-folder write]** An edit or delete can reach only some folders. → The API names the failed folders, and the error is logged. Resolution favors the newest `modified`, so a partial edit still shows the new values. A partial delete leaves the album listed with the remaining members, so the user can retry.
- **[Deleted album returns from Picasa]** If the user later adds a photo to the album in Picasa, re-import brings back the definition and the new membership, and the album is listed again. → This is intended: it is a new decision made in Picasa.
- **[Stale copies]** Folder copies without `modified` can disagree after Picasa renames, and only some folders' `.ini` may have been rewritten. → Path-order resolution is deterministic. Any edit in Paloma unifies all copies.
- **[Cover in a folder that fails to write]** If the cover photo's folder fails during a cover change, the old cover stays. Other folders may already have dropped their `cover`, so the default cover can show. → The API names the folder, and retrying fixes it.
- **[Lost update]** The same as for photo fields: an outside edit between read and rename is overwritten. → The window is milliseconds, and the watcher re-applies the file.
- **[Large delete]** Deleting an album with photos in hundreds of folders writes hundreds of files synchronously and blocks the server for that time. → It is acceptable for a local app. We can revisit with a background job if it is ever measured as slow.
- **[Token case]** Picasa tokens are lowercase hex, and tokens are compared exactly. → A hand-edited uppercase token is a different album. This is documented and not normalized, to avoid silently merging albums.

## Migration Plan

- On startup, the MVP album tables are dropped and the new ones created. Albums and memberships fill from the folder files on the next scan, since every folder state is applied when it is first loaded.
- MVP database-only albums are lost (BREAKING, accepted).
- Existing `.paloma.json` files with no `albums` key stay valid. Files that already have a hand-written `albums` section that is not an object of objects become unreadable and are logged.
- Rollback: revert the commit and delete `folder_albums`/`album_photos`. The MVP recreates its own tables. `albums` keys in v2 files are preserved by the previous `SidecarService` as unknown content.
