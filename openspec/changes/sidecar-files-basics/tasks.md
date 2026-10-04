# Tasks

## 1. Types and library columns

- [x] 1.1 In `shared/types.ts`, replace `SidecarFile`/`SidecarPhoto` with `PalomaFolderFile` (`format`, `version`, `iniHash?`, `photos`, index signature) and `PalomaPhotoEntry` (`star?`, `hidden?`, `caption?`, `keywords?`, `modified?`, index signature). Add `caption`, `keywords` and `isHidden` to `Photo`. Verify that `npm run build` type-checks.
- [x] 1.2 Add `caption`, `keywords` (JSON text) and `is_hidden` to `photos` in `db/schema.ts`, and add them in place in `db/index.ts` using `PRAGMA table_info` plus `ALTER TABLE ADD COLUMN`. Verify with a test that opens a database created without these columns and finds them added, with existing rows kept.

## 2. Picasa ini reader

- [x] 2.1 Implement `readPicasaIni(dir)` in `server/src/services/picasaIni.ts`, following design.md: file lookup, raw-byte SHA-256, UTF-8 with windows-1251 fallback, CRLF/LF, untrimmed values, first duplicate key wins, special sections skipped, and the mapping of `star`, `hidden`, `caption` and `keywords`. Verify with `picasaIni.test.ts` cases:
  - `.picasa.ini` vs `Picasa.ini`, and preference when both exist
  - an empty file
  - CRLF and LF line endings
  - a windows-1251 Cyrillic caption
  - values with leading and trailing spaces
  - a duplicate key
  - `keywords=a,,b`
  - `[Picasa]`, `[.album:x]` and `[Contacts2]` ignored
  - unsupported keys ignored
  - the hash equals the sha256 of the bytes

## 3. Sidecar module

- [x] 3.1 Rewrite `SidecarService` with a three-state `readFolderSidecar(dir)` and the validation rules from design.md. Verify with `SidecarService.test.ts` cases: missing file, valid v2, invalid JSON, MVP v1 shape, wrong `format`, `version: 3`, non-object `photos` entry, absent `photos`, and wrong-typed fields read as absent.
- [x] 3.2 Implement the pure `reimport(data, ini)`. Verify with tests:
  - an unmodified entry follows the `.ini`, including a removed caption and a deleted entry
  - a new section adds an entry
  - a `modified` entry is kept and a conflict is logged
  - unknown keys in entries survive
  - `iniHash` is updated
- [x] 3.3 Implement `getFolderState(dir)` with the live `.ini` view and re-import on a stale hash. Re-import writes only when `.paloma.json` exists and is readable. Verify with tests:
  - an `.ini`-only folder gives the `.ini` fields and writes no file
  - a stale hash re-imports and writes
  - a missing `.ini` with `iniHash` changes nothing
  - an unreadable sidecar gives no fields, ignores the `.ini`, and leaves the file unchanged
  - case-insensitive section matching keys entries by on-disk names
- [x] 3.4 Implement `updatePhotoFields(dir, filename, patch)`. It builds the base from the sidecar or the first `.ini` import, applies the patch, sets `modified`, applies the empty-entry rule, and writes with stable serialization and an atomic temp-file rename. Verify with tests:
  - a new file has the exact expected content
  - the first change in an `.ini` folder imports every supported section plus `iniHash`, including a missing-file section
  - unstarring removes the entry when there is no `iniHash`, and keeps `modified` when there is one
  - unknown top-level sections and entry keys are preserved
  - key order is stable
  - an unreadable sidecar throws and is unchanged
  - a read-only directory throws and leaves no temp file
  - `.picasa.ini` bytes are unchanged after every operation

## 4. Scanner reads and watches folder state

- [x] 4.1 In `scanPaths.ts`, let `.paloma.json` and `.picasa.ini` (any case) through `isIgnoredName`, while other dotfiles, `*.tmp` sidecar temp files, `.picasaoriginals/` and excluded paths stay ignored. Verify with new `scanPaths.test.ts` cases.
- [x] 4.2 In `FolderScannerService.indexPhoto`, set star, hidden, caption and keywords from the cached folder state on insert and on content change, and stop reading `geo`/`edits` from the sidecar. Update the existing "re-indexes a photo whose content changes" test to star through `.paloma.json`. Verify with tests:
  - the library is rebuilt from `.paloma.json`
  - an `.ini`-only folder shows `.ini` values and no `.paloma.json` is created
  - a v1 sidecar gives no fields and is unchanged
  - `.paloma.json` and `.picasa.ini` are never indexed as photos
- [x] 4.3 Route `add`/`change`/`unlink` watcher events for `.paloma.json` and the Picasa `.ini` to a folder-state handler on the per-root queue. The handler invalidates the cache, calls `getFolderState`, and applies the result to the folder's photos in one transaction, skipping folders not in the library. Verify with `FolderScannerService.test.ts` tests:
  - a hand edit of `.paloma.json` stars a photo without a restart
  - deleting `.paloma.json` clears the fields and the file is not recreated
  - a corrupt `.paloma.json` clears the fields and is not modified
  - an `.ini` change in an `.ini`-only folder updates the library with no write
  - an `.ini` change after import re-imports into `.paloma.json` and the library
  - a sidecar in an excluded folder and `.picasaoriginals/.picasa.ini` are ignored
- [x] 4.4 Verify that a sidecar entry for a missing file survives: with a starred `a.jpg`, move `a.jpg` out and back. Add a test that the entry is unchanged throughout and the photo is starred again.

## 5. API

- [x] 5.1 Add `PATCH /api/photos/:id`, with its logic in a testable function, following design.md: body validation (400), keyword normalization, `updatePhotoFields`, then applying the folder state to the library and returning the photo. `SidecarUnreadableError` returns 409, other write errors return 500, and both are logged with the folder path. Make `PATCH /api/photos/:id/star` delegate to it. Verify with tests:
  - set caption and keywords
  - clear a caption with `""`
  - an invalid body returns 400 and nothing changes
  - a corrupt sidecar leaves both the file and the database unchanged
  - a read-only folder leaves the database unchanged
  - the star shortcut gives the same result as the general route
- [x] 5.2 In `GET /api/photos`, return `caption`, `keywords` and `isHidden`, and exclude hidden photos unless `includeHidden=true`. In `GET /api/folders`, count only photos that are not hidden. Verify with tests on a folder of three photos with one hidden.
- [x] 5.3 Remove the `SidecarService` call from `POST /api/photos/:id/edit`, so edits are stored only in the database. Verify by grep that no route writes `edits` to the sidecar.

## 6. Integration check

- [x] 6.1 Run the app with `PALOMA_PHOTOS_DIRS` pointing at a copy of a real Picasa folder containing `.picasa.ini`.
  - Confirm the stars from the `.ini` show up and no `.paloma.json` is created.
  - Star a photo in the UI and confirm `.paloma.json` is created with the imported entries, `iniHash` and the new star.
  - Append `star=yes` for another photo to `.picasa.ini` and confirm the library and `.paloma.json` pick it up without a restart.
  - Confirm `.picasa.ini` is byte-identical to its original apart from your own edit.
- [x] 6.2 Verify that `npm run build` and `npm test` pass.
