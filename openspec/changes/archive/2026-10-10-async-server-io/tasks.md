# Tasks

## 1. Async data layer

- [x] 1.1 Split `server/src/db/index.ts` into an import-safe `db` export and `openDatabase(): Promise<void>` (data dir creation, connection, WAL pragma, `db/columns.ts` migrations); call it in `server/src/index.ts` before `app.listen` and in `beforeAll` of every test that imports `db`; verify `npm test` passes
- [x] 1.2 Add `server/src/db/query.ts` with `all`, `get`, `run` helpers and `withTransaction(async (tx) => …)` (async mutex gate, `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`, `AsyncLocalStorage` context, nested call reuses the open transaction); verify `db/query.test.ts` covers: commit, rollback on throw, a query from outside waits until commit and never sees uncommitted rows, nested call reuses the transaction
- [x] 1.3 Add `eachBatch(size, (afterId) => query)` keyset async generator and `chunked(ids, size, fn)` to `db/query.ts`; verify tests cover empty table, exact multiple of the batch size, rows inserted during iteration, and an id list larger than 32 766
- [x] 1.4 Move SQLite-only SQL fragments used by services (e.g. `substr(date_taken, 1, 4)` in `memories.ts`) into named helpers in `server/src/db/sqlite.ts`; verify `memories.test.ts` still passes

## 2. Streaming hash and async file access

- [x] 2.1 Make `MetadataService.calculateFileHash` stream the file into `XXH.h64(0xabcd).update(…)` and `extractMetadata` use `fs.promises.stat` concurrently with hashing; verify a test that hashes several fixture photos with `highWaterMark` 1, 7 and 64 KiB gets exactly the one-shot `XXH.h64(buffer, 0xabcd)` value
- [x] 2.2 Make `readPicasaIni` and `SidecarService` I/O (`listDir`, `readFolderSidecar`, `writeFolderSidecar`, `getFolderState`, `updateFolderSidecar`, `updatePhotoFields`, `updatePhotosFields`) async with `fs/promises`, keeping the temp-file-and-rename write; verify `SidecarService.test.ts` and `picasaIni.test.ts` pass after adding `await`, including the unreadable-sidecar and atomic-write cases
- [x] 2.3 Add `server/src/services/folderLock.ts` (`withFolderLock(dir, fn)`, keyed async mutex that deletes idle entries) and use it in `updateFolderSidecar` and the `.ini` re-import write in `getFolderState`; verify `folderLock.test.ts`: two concurrent `updatePhotoFields` calls on one folder both end up in `.paloma.json`, calls on different folders run in parallel, and the lock map is empty afterwards
- [x] 2.4 Replace `existsSync`/`renameSync`/`mkdirSync` in `ThumbnailService` (cache dir creation moves to `ThumbnailService.init()` called at start), `faceImages.ts` and `renderApi.ts` with `fs/promises` and `ENOENT` handling; verify `ThumbnailService.test.ts`, `faceImages.test.ts` and `photoImages.test.ts` pass, plus a test that a missing source file still gives `404 file_not_found`
- [x] 2.5 Make `photoInfo.ts` file listing and stat async; verify `photoInfo.test.ts` passes
- [x] 2.6 Make plugin `state.ts`, `manifest.ts`, `discovery.ts` and the icon check in `registry.ts` use `fs/promises` (`plugins/testing.ts` stays sync as a test helper); verify all `plugins/*.test.ts` and `routes/plugins.test.ts` pass

## 3. Services on the async data layer

- [x] 3.1 Convert `FolderScannerService` to `await` helpers: `upsertFolder`, `indexPhoto`, the unlink handler, `setPhoto*`/`setFolder*` inside `withTransaction`, `removePhotos` via `chunked`; verify `FolderScannerService.test.ts` passes
- [x] 3.2 Rewrite `applyFolderState` to walk the folder's photos with `eachBatch` (one transaction per batch, folder albums/people in the last one) and `pruneFolders` to iterate folders in batches; verify a test with a folder of 1 200 photos applies every field and that a `GET`-style query issued during the apply is answered before the apply finishes
- [x] 3.3 Convert `photoApi.ts` (`listPhotos`, `getApiPhoto`, `updatePhoto`, `saveEdits`, `setPhotosLocation`, `changePhotosKeywords`, `savePhotoPatch`) and `folderChanges.ts` (`loadPhotos` via `chunked`, `saveFolderByFolder` taking folder locks in sorted order around write + `applyFolderState`); replace `listFolders`' per-folder count with one `GROUP BY` query; verify `photoApi.test.ts` and `textApi.test.ts` pass, plus new tests for the `sidecar-files` scenarios "Two photos changed at once" and "Batch change racing a single change" run with concurrent calls
- [x] 3.4 Convert `albumApi.ts` and `albumSidecar.ts` call sites (sidecar writes under the folder lock); verify `albumApi.test.ts`, `albumSidecar.test.ts` and `routes/albums.test.ts` pass
- [x] 3.5 Convert `people.ts` and `peopleApi.ts`; verify `peopleApi.test.ts` and `personValidation.test.ts` pass
- [x] 3.6 Rewrite `facesWithOwners` as a batch walk ordered by photo id, with `similarFaces` keeping only the best `limit` candidates and `unassignedFaces` the newest `limit` plus a running `total`; convert the rest of `faceDetectionApi.ts`; verify `faceDetectionApi.test.ts` passes and a new test with more faces than one batch returns the same results as before (ordering, `total`, dismissals, hidden photos)
- [x] 3.7 Convert `geoApi.ts`, `placeCache.ts`, `PlaceResolver.ts`, `geocoding.ts`, `memories.ts` and `tagApi.ts`; verify `geoApi.test.ts`, `PlaceResolver.test.ts`, `GeocoderService.test.ts` and `memories.test.ts` pass

## 4. Routes

- [x] 4.1 Add `server/src/routes/asyncRoute.ts` and use it for every route in `routes/index.ts`, removing per-route `try/catch`; drop `existsSync` probes before `sendFile` (missing file → `404 file_not_found` from the `sendFile` callback) and use `fs.promises.mkdir` in export and movie routes; verify `routes/errors.test.ts`, `routes/edits.test.ts` and `routes/memories.test.ts` pass, plus a test that a rejected handler reaches `apiErrorHandler` and a missing cached thumbnail answers 404

## 5. Guardrails and documentation

- [x] 5.1 Add `server/src/db/syncUsage.test.ts` that fails on builder `.all()/.get()/.run()/.values()`, `db.transaction(` and `fs.*Sync(` in `server/src` outside `db/`, tests, fixtures and the startup allow-list (`config.ts`, `plugins/testing.ts`); verify it passes on the converted tree and fails when a `readFileSync` is added to a service
- [x] 5.2 Add a test for the `folder-scanning` requirement "The library stays usable during a scan": start a scan of a generated folder of many photos and assert that `listPhotos` resolves before the scan's promise does; verify it passes
- [x] 5.3 Write `docs/server-data-layer.md` (async helpers, transaction gate and its rules, batching, folder lock, allowed sync calls, what a MySQL/PostgreSQL backend must implement) and link it from the Layout section of `AGENTS.md`; verify the links resolve

## 6. Verification

- [x] 6.1 Run `npm run build` and `npm test` from the repo root and verify both pass; then run `npm run dev` against a real photo folder and verify the library loads, a photo can be starred and existing thumbnails are reused (no re-render, since hashes are unchanged)
