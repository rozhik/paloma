# Design

## Context

See proposal.md for motivation and specs/folder-scanning/spec.md for the requirements.

Current MVP state:
- `server/src/index.ts` calls `FolderScannerService.scanAndWatchFolder(dir)` for each entry of `config.photosDirs` after `app.listen`.
- `FolderScannerService` starts one chokidar watcher per root (`ignoreInitial: false`), so the initial scan and live watching use the same `add` events. Files are indexed one at a time through a promise queue per watcher. `isIgnored` skips dot-names, `node_modules` and `config.excludeDirs`.
- `indexPhoto` skips a file if a row with the same folder and filename exists; otherwise it extracts metadata, generates thumbnails (cache files named by content hash), applies the folder's `.paloma.json` (star, geo, edits) and inserts a row.
- `unlink` deletes only the `photos` row. SQLite foreign keys are **not** enabled (`PRAGMA foreign_keys` is never set), so `ON DELETE CASCADE` in the schema does nothing and `edits`, `face_annotations`, `photo_tags`, `album_photos` rows are orphaned.
- `change` events are not handled.
- Each root has its own watcher, queue and folder-id map; with nested roots both watchers index the same files concurrently and can insert duplicates.

## Goals / Non-Goals

**Goals:**
- Meet the folder-scanning spec with the smallest change to the MVP scanner.
- Unit tests for the path rules and integration tests for scanning against a temporary folder and database.

**Non-Goals:**
- Reconciling files deleted or changed while the server was off.
- Changing metadata extraction, thumbnail sizes or the `.paloma.json` format.
- Enabling SQLite foreign keys globally.
- Cleaning up stale thumbnail cache files.

## Decisions

### 1. Prune the catalog before scanning, by path rules only
At startup, before any watcher starts, delete every `folders` row whose path is not covered by the configuration, plus its photos and their dependent rows. A path is covered when it equals or lies inside one of `config.photosDirs`, and no excluded directory, dot-name segment or `node_modules` segment lies between it and that root — the same rules `isIgnored` uses for scanning.

The check is purely path-based and never touches the file system, so folders of a configured but unmounted root stay covered (spec: "Temporarily missing configured folder is kept").

Alternative considered: prune lazily per root after its scan finishes. Rejected: it can't see folders whose root was removed from the configuration, and it needs the root to exist.

### 2. Explicit deletion of dependent rows
Add one internal helper that removes photos by id in a single transaction: `edits`, `face_annotations`, `photo_tags`, `album_photos`, then `photos`. Use it both for pruning and for the `unlink` handler, so a deleted photo leaves no data behind (spec: "Photos deleted while running leave the library").

Alternative considered: `PRAGMA foreign_keys = ON`. Rejected for now: it changes behavior of every MVP route (e.g. inserts with unknown ids start failing) and is outside this change.

### 3. Collapse nested roots
Before scanning, resolve and de-duplicate `config.photosDirs` and drop every root that lies inside another configured root. Only the outer roots get a watcher, so each file is seen by exactly one queue. Pruning still uses the full list (the result is identical, since inner roots are covered by outer ones).

Alternative considered: a single global indexing queue and a shared folder-id map across watchers. Rejected: more moving parts for the same result.

### 4. Index and re-index through one function
Extend `indexPhoto` to handle both cases:
- no row → insert (current behavior);
- row exists and the event is `change` → compute metadata; if the content hash is unchanged, do nothing; otherwise generate thumbnails for the new hash and update `fileHash`, `width`, `height`, `fileSize`, `dateTaken`, `latitude`, `longitude` (location from `.paloma.json` `geo` if set, else from EXIF — same rule as insert). `isStarred` and the `edits` row are not touched.
- row exists and the event is `add` → skip (current behavior).

The `change` handler enqueues into the same per-root queue as `add`.

### 5. Wait for writes to finish only for live events
Chokidar's `awaitWriteFinish` would also delay every file of the initial scan and poll each one, which is too slow for large libraries. Instead, track the watcher's `ready` event: `add` and `change` events that arrive after `ready` first wait until the file size and mtime stay the same for ~1 s (polling `fs.stat`), then are enqueued. Initial-scan events are enqueued directly.

### 6. Startup flow
`index.ts` calls one new entry point (e.g. `FolderScannerService.startConfiguredFolders()`), which prunes, collapses nested roots and then calls `scanAndWatchFolder` for each remaining root, logging and continuing on a missing root (current behavior).

### 7. Remove runtime folder adding
Delete `POST /api/folders/scan`, the "Add folder" button in `Navbar`, `ImportModal` and its state in `App`, and change the sidebar empty-state text to point to `PALOMA_PHOTOS_DIRS` in `.env`. `scanAndWatchFolder` becomes private and is called only from `startConfiguredFolders()`.

Alternative considered: keep the button visible but disabled. Rejected: a disabled control with no action confuses users, and keeping the endpoint would leave a second way to add folders that bypasses pruning and root collapsing.

### 8. Tests
- Pure helpers (path coverage, root collapsing) are exported and unit-tested.
- Integration tests in `FolderScannerService.test.ts`: set `PALOMA_DATA_DIR`, `PALOMA_CACHE_DIR`, `PALOMA_PHOTOS_DIRS`, `PALOMA_EXCLUDE_DIRS` with `vi.stubEnv` before dynamically importing the modules (config and DB are created at import time); generate small images with `sharp` in a temp folder; wait for results with `vi.waitFor`. A `stopAll()` method closes watchers between tests.

### Files in the user's photo folders
- Read: supported image files under configured roots; `.paloma.json` in each folder (read-only, existing behavior).
- Written or deleted: none. Thumbnails are written only to `PALOMA_CACHE_DIR`.

### MVP code
- Reused as is: `config.ts` (`photosDirs`, `excludeDirs`), `SUPPORTED_EXTENSIONS`, `isIgnored`, `upsertFolder`, per-root sequential queue, `MetadataService`, `ThumbnailService`, `SidecarService.readSidecar`.
- Rewritten: startup loop in `index.ts`; `unlink` handler (uses the removal helper); `indexPhoto` (insert or update); `LeftSidebar` empty-state text.
- Added: prune step, root collapsing, `change` handler, live write-stability wait, `stopAll()`, tests.
- Dropped: `POST /api/folders/scan`, `client/src/components/ImportModal.tsx`, the "Add folder" button in `Navbar` and the import-modal state in `App`.

## Risks / Trade-offs

- [Folders added earlier with the removed "Add folder" button are pruned on the first start] → accepted and listed as BREAKING; add them to `PALOMA_PHOTOS_DIRS` to keep them.
- [Pruning removes DB-only data (album membership, face annotations) for a folder that was removed from `.env` by mistake] → star and edits come back from `.paloma.json` when the folder is re-added; log every pruned folder path at startup so the user can see what happened.
- [A typo in `PALOMA_PHOTOS_DIRS` prunes a whole indexed folder] → same mitigation: logged; data rebuilds from disk and `.paloma.json` after fixing the path.
- [Unplugging a disk while the server runs can produce `unlink` events and remove its photos] → out of scope (spec only covers a disk missing at start); revisit with startup reconciliation.
- [Re-indexing a photo with a saved crop after its dimensions changed can leave the crop out of bounds] → edits are kept as the spec requires; the editor/export change will handle invalid crops.
- [Old thumbnail cache files remain after re-index] → harmless disk use; cache cleanup is a separate concern.

## Migration Plan

No schema change. On the first start after deploy, folders outside the configuration are pruned and logged. Rollback: revert the code; pruned folders return only when they are scanned again.
