# Tasks

## 1. Test harness

- [x] 1.1 Create `server/src/services/FolderScannerService.test.ts` with a setup that creates temp photo/data/cache folders, stubs `PALOMA_*` env vars with `vi.stubEnv` before dynamically importing the scanner and DB, generates small test images with `sharp`, and adds `FolderScannerService.stopAll()` to close watchers in `afterEach`; verify with one smoke test (one `.jpg` in a temp root appears in `photos`) passing under `npm test`

## 2. Confirm existing scanning behavior

- [x] 2.1 Add tests for current behavior: recursive scan with one library folder per directory, supported extensions incl. upper-case, non-image files ignored, dot-folders/`node_modules`/`PALOMA_EXCLUDE_DIRS` skipped, rescan without duplicates, corrupt file logged without stopping the scan, live add and live add of a new subfolder; verify all pass (fix the scanner only where a test exposes a deviation from the spec)

## 3. Path rules and nested roots

- [x] 3.1 Extract and export a pure `isPathCovered(path, photosDirs, excludeDirs)` helper using the same rules as `isIgnored`; verify unit tests for inside/outside root, excluded subtree, dot-segment, `node_modules`, and a configured-but-missing root
- [x] 3.2 Add and export `collapseRoots(dirs)` that resolves, de-duplicates and drops roots nested inside other roots; verify unit tests for duplicates, nesting and trailing separators
- [x] 3.3 Verify with an integration test that `PALOMA_PHOTOS_DIRS=<root>,<root>/sub` indexes each photo under `sub` exactly once

## 4. Photo removal without orphans

- [x] 4.1 Add an internal helper that deletes photos by id in one transaction together with their `edits`, `face_annotations`, `photo_tags` and `album_photos` rows, and switch the `unlink` handler to it; verify with a test that deleting an edited, album-linked photo file removes the photo and leaves no dependent rows

## 5. Startup pruning

- [x] 5.1 Add `FolderScannerService.startConfiguredFolders()` that prunes folders not covered by the configuration (using 3.1 and 4.1, logging each pruned path), then scans and watches the collapsed roots (3.2), logging and continuing on missing roots; verify tests for: folder removed from config is pruned, newly excluded subfolder is pruned, configured-but-missing root keeps its photos, re-added folder is indexed again, files on disk are unchanged
- [x] 5.2 Replace the startup loop in `server/src/index.ts` with `startConfiguredFolders()`; verify by running `npm run dev` with a temp `PALOMA_PHOTOS_DIRS` and checking `GET /api/photos` lists its photos

## 6. Remove runtime folder adding

- [x] 6.1 Remove `POST /api/folders/scan` from `server/src/routes/index.ts`, make `scanAndWatchFolder` private and switch scanner tests to `startConfiguredFolders()`; verify `npm test` passes, verify `curl -X POST localhost:$PORT/api/folders/scan` returns 404 under `npm run dev` and `npm run build` passes
- [x] 6.2 Delete `client/src/components/ImportModal.tsx`, remove the "Add folder" button from `Navbar.tsx` and the import-modal state from `App.tsx`, and change the `LeftSidebar.tsx` empty-state text to point to `PALOMA_PHOTOS_DIRS` in `.env`; verify `npm run build` passes and the library screen under `npm run dev` has no "Add folder" button and shows the new hint with an empty library

## 7. Re-index changed photos

- [x] 7.1 Extend `indexPhoto` to update an existing row on `change` when the content hash differs (new thumbnails, dimensions, size, date, location with `.paloma.json` geo override), leaving `isStarred` and the `edits` row untouched, and handle chokidar `change` events through the same queue; verify a test that rewrites a starred, edited photo with different dimensions and sees the new hash/dimensions while star and edits stay
- [x] 7.2 Make live `add`/`change` events (after watcher `ready`) wait until file size and mtime are stable before enqueueing, while initial-scan events go straight to the queue; verify a test that writes a file in two chunks with a pause and gets one correctly indexed photo

## 8. Wrap-up

- [x] 8.1 Update `.env.example` comments for `PALOMA_PHOTOS_DIRS`/`PALOMA_EXCLUDE_DIRS` to mention that folders outside them are removed from the library on start; verify the file reads correctly
- [x] 8.2 Run `npm run build` and `npm test` from the repo root and verify both pass
