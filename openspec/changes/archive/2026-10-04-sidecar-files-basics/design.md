# Design

## Context

See proposal.md (Why) for the motivation. The specs in `specs/sidecar-files/` and `specs/folder-scanning/` define the behavior. This document covers how it maps onto the MVP code.

The `.picasa.ini` format reference is `docs/picassa/07-picasa-ini-format.md`. `docs/picassa/08-paloma-json-format.md` proposes a richer v2. This change adopts its envelope (`format`, `version`, `photos`) and its field names (`star`, `hidden`, `caption`, `keywords`, `modified`). It replaces the 08 `import` object with a single top-level `iniHash`. `import` stays reserved and is preserved untouched.

Current MVP state:
- **`SidecarService` read.** It reads `.paloma.json` with `JSON.parse` and no validation. Any parse error returns `null`, and the next write then replaces the file.
- **`SidecarService` write.** `writeSidecar` rebuilds the whole file from `{version, folder_name, photos}`, so other top-level keys are lost. The write is a plain `writeFileSync`.
- **Indexing.** `FolderScannerService.indexPhoto` reads `is_starred`, `geo` and `edits` from the sidecar, but only when it inserts a new photo. It caches sidecars only during the initial scan.
- **Watcher filter.** `scanPaths.isIgnoredName` drops every dotfile, so the watcher never sees `.paloma.json` or `.picasa.ini`.
- **Database.** Tables are created with `CREATE TABLE IF NOT EXISTS` and there is no migration mechanism. `photos` has no caption, keywords or hidden columns. The `tags`/`photo_tags` tables exist but nothing writes them.
- **Routes.** `PATCH /photos/:id/star` updates the database first and then the sidecar. `POST /photos/:id/edit` writes `EditDAG` into the sidecar's `edits`.
- **Picasa files.** There is no `.ini` reader.

## Goals / Non-Goals

**Goals:**
- One module owns the folder's photo-field state. It reads and validates `.paloma.json`, reads the Picasa `.ini`, imports and re-imports, and writes. Routes and the scanner ask it for "effective fields of folder X" and call it to "change fields of photo Y". They never touch JSON or INI directly.
- Paloma never destroys data in `.paloma.json` or in any Picasa file.

**Non-Goals:**
- Paloma does not interpret `folder`, `albums`, `people`, `import` or `extra`. It only preserves them.
- No `.ini` keys besides `star`, `hidden`, `caption` and `keywords`. Other keys are not copied into `.paloma.json` either. The `.ini` stays on disk as the source for later imports.
- No `.picasaoriginals/` handling.
- No reading of caption or keywords embedded in JPEG IPTC/XMP. That is a separate change.
- No migration from MVP v1 sidecars.
- No UI controls for caption, keywords or hidden. The client keeps showing what it shows today. The client star toggle keeps its behavior: on failure it doesn't refresh, so the star doesn't change.
- No conflict detection between a Paloma write and a simultaneous outside edit of `.paloma.json`. The last writer wins (see Risks).

## Decisions

### Files touched in user photo folders

| File | Read | Written |
| :--- | :--- | :--- |
| `<folder>/.paloma.json` | On scan/index, on watcher events for it or the `.ini`, before every change | On a user field change (creating it if absent). On re-import of a changed `.ini`, only if the file exists and is readable v2 |
| `<folder>/.paloma.json.<pid>.<random>.tmp` | Never | Created during a write and renamed onto `.paloma.json`. Deleted if the write fails |
| `<folder>/.picasa.ini`, `<folder>/picasa.ini` (any case) | On scan/index, on watcher events for it, before every change | Never |
| `<folder>/.picasaoriginals/**` | Never (hidden folder) | Never |
| `<folder>/.paloma/originals/<file>` | Unchanged by this change (MVP edit route) | Unchanged by this change |

No photo files are read or written for sidecar purposes.

### Sidecar read is three-state

`readFolderSidecar(dir)` returns one of:
- `{ kind: 'missing' }`: there is no file.
- `{ kind: 'ok', data }`: valid v2.
- `{ kind: 'unreadable', reason }`.

The MVP returned `null` for both "missing" and "broken", and that is how it came to overwrite broken files.

A file is `ok` when all of these hold:
- it is a JSON object
- `format === "paloma-folder"` and `version === 2`
- `photos` is either absent (treated as `{}`) or a plain object whose values are all plain objects
- `iniHash` is either absent or a string

Field values are interpreted leniently:
- `star`/`hidden` count only as `=== true`.
- `caption` counts only as a non-empty string.
- `keywords` counts only as an array of strings; non-string items are dropped when it is read into the library.
- Anything else counts as absent for the library and stays in the file until that field is set.

*Alternative considered:* repairing malformed files. We rejected it because a guessed repair is a silent overwrite.

### Picasa `.ini` reader

`readPicasaIni(dir)` returns `{ kind: 'missing' }` or `{ kind: 'ok', fileName, sha256, sections }`. `sections` maps a section name to its supported fields only.
- **Locating the file.** The reader lists the directory and picks entries whose lowercase name is `.picasa.ini`, else `picasa.ini`. If several match, the one with the leading dot wins, then the exact lowercase name.
- **Hash.** `sha256` is computed over the raw bytes.
- **Decoding.** `new TextDecoder('utf-8', { fatal: true })`. On failure it uses `new TextDecoder('windows-1251')`. Node's bundled ICU provides it, so no new dependency is needed. A leading BOM is stripped.
- **Lines.** The text is split on `\r\n`, falling back to `\n`. Blank lines are skipped. `[name]` starts a section. `key=value` splits at the first `=`. Values are not trimmed. The first occurrence of a key in a section wins.
- **Sections.** `Picasa`, `Contacts`, `Contacts2`, `encoding`, `photoid`, `(null)` and `.album:*` are skipped. Every other section is a file section.
- **Field mapping.** `star=yes` → `star: true`, `hidden=yes` → `hidden: true`. `caption` → `caption` if non-empty. `keywords` is split on `,` with empty items dropped (other items kept verbatim) and stored if any remain. Sections with no supported fields are dropped.
- **An empty file** (0 bytes) is `ok` with no sections.

Section-to-file matching happens in the service, because it needs the directory listing. A section matches the on-disk file whose name is equal ignoring case (`toLowerCase`). The entry is keyed by the on-disk name, or by the section name when no file matches. If two sections differ only by case, the first one wins.

### Effective fields for a folder

`getFolderState(dir)`:
1. Read the sidecar.
   - `unreadable` → no fields, and log the error.
   - `ok` → use it. If it has `iniHash` and the `.ini` exists with a different hash, run a re-import first (below) and use the result.
   - `missing` → step 2.
2. Read the `.ini`. If it is `ok`, the fields are its sections (live view, nothing is written). Otherwise there are no fields.

The result is a map from file name to `{ star, hidden, caption, keywords }`. The scanner and the watcher use it.

### Write path: read-reconcile-modify-write, atomic rename

`updatePhotoFields(dir, filename, patch)`, where the patch is a subset of `{ star, hidden, caption, keywords }` already normalized by the route:
1. Read the sidecar. If it is `unreadable`, throw `SidecarUnreadableError`.
2. Build the base:
   - If the sidecar is missing and the `.ini` is `ok`, use `{format, version: 2, iniHash, photos: <imported entries>}`.
   - If both are missing, use `{format, version: 2, photos: {}}`.
   - If the sidecar is `ok`, use its parsed object, re-imported first if its `iniHash` is stale.
3. Apply the patch to the entry. A set field is written. A cleared field (`false`, empty string, empty list) has its key deleted. Set `modified = new Date().toISOString()`. If the only key left is `modified` and there is no `iniHash`, delete the entry.
4. Serialize: top-level keys in their existing order (`format`, `version`, `iniHash`, `photos` for new files), `photos` keys sorted with `localeCompare` in the `en` locale using `sensitivity: 'variant'`, then `JSON.stringify(_, null, 2) + '\n'`.
5. `writeFileSync` the temp file in the same directory, then `renameSync` it onto `.paloma.json`. On error, remove the temp file and rethrow.

All steps are synchronous, so concurrent API requests for one folder can't interleave inside Paloma, and we don't need a lock. The temp file sits in the same directory so `rename` is atomic. Its name starts with a dot, so the scanner already ignores it.

*Alternative considered:* the `write-file-atomic` package. Same behavior plus fsync, but it adds a dependency. We can revisit if we see corrupted files after power loss.

### Re-import

`reimport(data, ini)` is a pure function, so it is unit-testable:
- For each entry without `modified`, replace its supported fields with the `.ini` values for that key. If none remain and the entry has no other keys, delete it.
- For each `.ini` section without an entry, add an entry.
- Entries with `modified` are left alone. If their supported fields differ from the `.ini` values, log `conflict: <dir>/<file> changed in Paloma and in .picasa.ini; keeping Paloma value`.
- Set `iniHash`.

The function only touches `star`, `hidden`, `caption` and `keywords`. Other keys in an entry survive.

Triggers:
- **Scan/index.** Through `getFolderState`, when the hash is stale. This is the one case where scanning writes, and only into an existing readable `.paloma.json`.
- **Watcher.** A `change`/`add` event for the `.ini`.
- **Write path.** Step 2.

A missing `.ini` never triggers a re-import, so deleting the `.ini` after import changes nothing.

*Alternative considered:* per-section hashes, as in the 08 `import.sections`. They would let us re-import only the sections that changed, and flag conflicts only when the matching `.ini` section actually changed. We rejected them for now because a single `iniHash` was requested and is enough for the unmodified-entry rule. The cost: a conflict is logged for a `modified` entry whenever the `.ini` changes anywhere and that entry's values differ. That is acceptable for a log line.

### Library columns

The `photos` table gains `caption TEXT NULL`, `keywords TEXT NULL` (JSON array) and `is_hidden INTEGER NOT NULL DEFAULT 0`. They are added in `db/index.ts` after table creation, by checking `PRAGMA table_info(photos)` and running `ALTER TABLE … ADD COLUMN` for missing columns, so existing databases keep working. `schema.ts` gains the same columns.

Keywords are a JSON column rather than rows in the MVP `tags`/`photo_tags` tables. The sidecar is the source of truth and the library is a cache, so a single column applied in one statement is simpler. Search by keyword is out of scope. The tag tables are left as they are.

`applyFolderState(folderId, state)` sets all four columns for every library photo in the folder in one transaction. `indexPhoto` uses the same per-photo values on insert and on content change. On a content change, the values come from disk, which matches what the library already shows, so the folder-scanning rule "star is kept on content change" holds.

### API

- **`PATCH /api/photos/:id`.**
  - The handler validates the body: at least one known key, and the right types (`isStarred`/`isHidden` boolean, `caption` string, `keywords` array of strings). Otherwise it returns 400.
  - Keywords are normalized: empty strings and duplicates dropped, first order kept.
  - The handler calls `updatePhotoFields`, then `applyFolderState` for the folder, then returns the photo as the list returns it.
  - Errors: `SidecarUnreadableError` → 409. Other write errors → 500. Both are logged with the folder path.
  - Applying the whole folder state, not just one photo, also picks up an `.ini` re-import that happened in the same write.
- **`PATCH /api/photos/:id/star`** delegates to the same handler with `{ isStarred }`.
- **`GET /api/photos`** adds `caption`, `keywords` (parsed, `[]` if null) and `isHidden`. It adds the condition `is_hidden = 0` unless `includeHidden=true`.
- **`GET /api/folders`** counts only photos that are not hidden.
- **`POST /api/photos/:id/edit`** no longer calls `SidecarService`.

### Watching

- **Filter.** `isIgnoredName` lets through names whose lowercase form is `.paloma.json` or `.picasa.ini`. `picasa.ini` has no dot and isn't ignored anyway. Every other dotfile is still ignored, including temp files, `.paloma/` and `.picasaoriginals/`. Exclude-dir checks still apply to the full path.
- **Routing.** Watcher `add`/`change`/`unlink` events for these files go to a folder-state handler, never to photo indexing. They are enqueued on the same per-root queue as photo indexing, so events for one folder are applied in order.
- **Handler.** The handler calls `getFolderState(dir)`, which may re-import and write. It then calls `applyFolderState` if the folder exists in the library. Folders with no photos are not created.
- **Caching.** The per-root cache of folder state lives for the watcher's whole life. Folder-state events invalidate it, and `indexPhoto` reads through it.
- **Own writes.** Paloma's own writes trigger events too. Applying the state again is idempotent, and a re-import of an unchanged `.ini` is a no-op because the hash matches. So we don't suppress our own echo, and writes can't loop.
- **No stability wait.** These files skip `waitUntilStable`. Atomic replacers produce complete files. A torn read of `.paloma.json` reads as `unreadable` for a moment and is corrected by the next event. A torn `.ini` read may import partial data once, and the next `change` event re-imports it, because the hash differs.

### MVP code: reused, rewritten, dropped

- **Rewritten:** `server/src/services/SidecarService.ts`. Covers the three-state read, `getFolderState`, `updatePhotoFields`, `reimport`, and the atomic stable write. `SidecarService.test.ts` is rewritten.
- **New:** `server/src/services/picasaIni.ts` with `picasaIni.test.ts`.
- **Rewritten:** `shared/types.ts`. `SidecarFile`/`SidecarPhoto` become `PalomaFolderFile` and `PalomaPhotoEntry`. `Photo` gains `caption: string | null`, `keywords: string[]` and `isHidden: boolean`.
- **Reused, modified:** `FolderScannerService.ts`. The queue, the folder-id map, `upsertFolder` and `removePhotos` are reused. `indexPhoto` reads the four fields through the folder state. Folder-state event handling is added.
- **Reused, modified:** `scanPaths.ts` (filter exception), `db/schema.ts` and `db/index.ts` (columns).
- **Reused, modified:** `routes/index.ts`. Adds the new PATCH route, changes the star route, the photo list and the folder counts, and changes the edit route.
- **Dropped:** reading `geo` and `edits` from the sidecar, and `folder_name` in the file.

## Risks / Trade-offs

- **[Lost update]** An outside edit of `.paloma.json` that lands between Paloma's read and rename is overwritten. → The window is milliseconds, and the watcher then applies the file Paloma wrote, so the library and the disk agree.
- **[Coarse conflict log]** With one whole-file `iniHash`, conflicts are logged for every `modified` entry that differs from the `.ini` whenever the `.ini` changes, even if that entry's section didn't change. → It is only a log. Per-section hashes can replace `iniHash` later behind a version bump.
- **[Scan writes on re-import]** A stale `iniHash` makes scanning write `.paloma.json`. → It writes only into an existing readable file, and Picasa users expect changes made in Picasa to show up.
- **[Encoding guess]** A non-UTF-8 `.ini` from a non-Cyrillic Windows locale would decode wrongly as windows-1251. → The 07 corpus is UTF-8 or Cyrillic. Other code pages can be added later.
- **[v1 data lost]** Users of the MVP lose stars stored in v1 files and can't change photos in those folders until they delete or fix the file. → This was accepted. The error log names the file.
- **[Edits not portable]** Edits saved in this version live only in the database. → This is temporary, and the edits-in-sidecar change fixes it.
- **[Case-insensitive filesystems]** Entry keys are on-disk names. Sections matching more than one file by case (possible only on case-sensitive filesystems) map to the first match in sorted order. → This is rare and logged.

## Migration Plan

- The DB columns are added in place on startup. No data migration is needed: fields fill from disk on the next scan.
- Existing v1 files are left on disk and logged as unreadable.
- Rollback: revert the commit. The extra columns are harmless to the MVP. v2 files written in the meantime are ignored by the MVP reader, because they have no `is_starred`.
