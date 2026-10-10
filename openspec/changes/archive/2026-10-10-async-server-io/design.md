# Design

## Context

See proposal.md for the motivation. Current state of the server (`server/src`):

- **Database.** `db/index.ts` opens one `better-sqlite3` connection at import time (WAL), wraps it in drizzle and creates/migrates tables with raw SQL from `db/columns.ts` (`PRAGMA table_info`, `ALTER TABLE`, `CREATE TABLE IF NOT EXISTS`). Services call the synchronous builder terminators `.all()`, `.get()`, `.run()` directly (~100 sites; 43 in `FolderScannerService`). `db.transaction((tx) => …)` takes a synchronous callback — drizzle's better-sqlite3 session rejects a promise-returning one. Today's correctness silently relies on this: a sidecar read-modify-write plus the library update happen in one uninterrupted step.
- **Whole-table reads.** `facesWithOwners()` loads every detected face with its 512-byte descriptor plus every face mark for each `/people/:id/similar` and `/faces/unassigned` call; `listFolders()` runs one count query per folder and materializes the ids just to take `.length`; `pruneFolders()` and `applyFolderState()` load all rows of a table/folder and update them in one transaction; `removePhotos()` and `inArray(...)` callers pass id lists of unbounded length (SQLite's variable limit is 32 766, PostgreSQL's 65 535).
- **Files.** `MetadataService.calculateFileHash` does `readFileSync` of the whole photo and `XXH.h64(buffer, 0xabcd)`; `SidecarService` and `picasaIni` read/list/write synchronously; `ThumbnailService`, `faceImages`, `renderApi`, `routes/index.ts` probe with `existsSync` and rename with `renameSync`; plugin state/manifest/discovery use `*Sync` calls.
- **Routes.** Express 4 does not catch rejected promises; existing async routes wrap their body in `try { … } catch (err) { next(err) }`.

## Goals / Non-Goals

**Goals:**
- No synchronous file or database call on any request or scan path; the only allowed `*Sync` calls are in startup code that runs before the server listens and in test helpers.
- Memory per operation is bounded by a batch size, not by the size of a file or a table.
- Service code is written against an interface that a MySQL/PostgreSQL driver can implement without touching services: async queries, async transactions, bounded parameter lists, dialect-specific SQL in `db/`.
- Behavior, API responses, sidecar content and the photo hash stay identical; the existing test suite (after adding `await`) passes unchanged in meaning.

**Non-Goals:**
- Adding a MySQL/PostgreSQL driver or a second drizzle schema (`pg-core`/`mysql-core`).
- Replacing hand-written table creation in `db/columns.ts` with drizzle-kit migrations.
- Worker threads, a separate scan process, `UV_THREADPOOL_SIZE` tuning, or a faster hash library.
- Streaming JSON responses: list endpoints are already paged (`limit` ≤ 500) or small.
- Client changes.

## Decisions

### 1. A thin async query layer over drizzle, not a repository rewrite

New `db/query.ts` exports `all(q)`, `get(q)`, `run(q)` and `withTransaction(fn)`. Services keep building queries with drizzle and pass the builder in: `await all(db.select().from(photos).where(…))`. The helpers wait on the transaction gate (decision 2), then execute. On SQLite they call the builder's sync terminator; a PostgreSQL implementation would `await` the builder instead (`get` = first row of the result).

*Alternatives:* (a) `await builder` directly — drizzle builders are thenable on every dialect, but there is no hook to apply the transaction gate, so concurrent requests could run inside another request's transaction. (b) A repository per table hiding drizzle — cleanest for a backend swap, but rewrites every service at once and duplicates what drizzle already abstracts. The helpers are the smallest seam that gives both gating and a single place to change execution.

A guard test (`db/syncUsage.test.ts`) scans `server/src` (excluding `db/` and `*.test.ts`/fixtures) and fails on `.all()`, `.get()`, `.run()` builder terminators (not `.values()`, which `Map` shares; lines like ffmpeg's `.run()` carry a `// ffmpeg, not a query` marker), `db.transaction(` and `fs.*Sync(` outside the startup allow-list, so the rule holds after this change.

### 2. Async transactions serialized by a gate on the single SQLite connection

`withTransaction(async (tx) => …)` takes the write gate (an async mutex), issues `BEGIN IMMEDIATE` on the connection, runs `fn` inside an `AsyncLocalStorage` context, then `COMMIT` (or `ROLLBACK` on throw) and releases the gate. Every helper call outside that context waits while the gate is held; calls inside it pass straight through. `tx` is the same drizzle instance on SQLite, but services must use the `tx` they are given so a PostgreSQL implementation can pass its real transaction object.

*Why:* with one connection, an `await` inside a transaction lets other requests' statements run on that connection — inside the open transaction. The gate makes that impossible while still allowing `await` inside the body, which PostgreSQL requires. Nested `withTransaction` inside an open context reuses it (no savepoints needed today).

*Alternative:* keep transaction bodies synchronous (no `await` inside). Safe on SQLite, but every body would have to be rewritten again for PostgreSQL; this change exists to avoid that.

*Rule:* transaction bodies contain only database work; file I/O (sidecar writes, sharp) happens before or after, never inside, so the gate is held for milliseconds.

### 3. Bounded reads: keyset batches and SQL aggregation

- `db/query.ts` adds `eachBatch(size, (afterId) => query)`: an async generator that pages by primary key (`WHERE id > ? ORDER BY id LIMIT size`) and yields between pages. Keyset rather than `OFFSET`, so it stays O(n) and is stable while rows are inserted. Default batch 500.
- `inArray` callers with caller-sized id lists go through `chunked(ids, 500, fn)`; `removePhotos`, `loadPhotos`, `albumsOf`, export/movie selection, `setPhotosLocation`, `changePhotosKeywords`.
- `listFolders` becomes one `LEFT JOIN … GROUP BY folders.id` with `count(photos.id)` filtered on `is_hidden = 0`.
- `facesWithOwners` becomes a batch walk over detected faces ordered by `photo_id` (marks fetched per batch of photos). `similarFaces` keeps only the `limit` best candidates (a bounded sorted array) plus the person's reference descriptors; `unassignedFaces` keeps the `limit` newest plus a running `total`. Memory is O(batch + limit + references) instead of O(all faces).
- `applyFolderState` walks the folder's photos in batches, one transaction per batch, yielding between batches. *Trade-off:* a reader may briefly see a folder half-updated after an outside sidecar edit; the library is a cache of the folder files and converges on the next batch, which the `Outside changes are applied` requirement already allows (no atomicity is specified). `setFolderAlbums`/`setFolderPeople` run in one more transaction after the last batch.
- `pruneFolders` iterates folders with `eachBatch` and removes each folder's photos in chunks.

### 4. Streaming file hash with an unchanged value

`calculateFileHash` becomes async: `fs.createReadStream(filePath)` piped into `XXH.h64(0xabcd).update(chunk)` and `.digest().toString(16)`. xxHash64 is defined over the byte stream, so the incremental digest equals the one-shot `XXH.h64(buffer, 0xabcd)`; a test hashes fixture files with tiny `highWaterMark` values and compares with the one-shot value. This keeps thumbnail cache names (`<hash>_thumb.webp`) and `photos.file_hash` valid — no re-index, no cache rebuild. `stat` and hashing run concurrently.

*Alternative:* switch to a native/WASM hash (faster) — changes no hash value only if the same algorithm and seed are used, and adds a dependency; deferred.

### 5. `fs/promises` everywhere on request/scan paths; ENOENT instead of `existsSync`

- Existence probes before `res.sendFile` are dropped: `sendFile` already reports a missing file to its callback, which answers 404 with the existing `file_not_found` body. Cache lookups (`ThumbnailService.getImage`, `faceImages`) use `fs.promises.access`/`stat` and treat `ENOENT` as "not cached". `renameSync` → `fs.promises.rename`.
- `SidecarService.readFolderSidecar`, `listDir`, `writeFolderSidecar`, `getFolderState`, `updateFolderSidecar` and `readPicasaIni` become async with the same results. `.paloma.json` and `.ini` files are small and parsed as a whole, so they are read with `readFile`, not streamed.
- `photoInfo` uses `readdir`/`stat` from `fs/promises`; plugin `state`, `manifest`, `discovery` and `registry` icon checks use their async counterparts.
- Startup-only sync calls stay and are allow-listed: `config.ts` (`.env`/root discovery at import), data directory creation (moved into `openDatabase()`); the cache directory is created on first write by a memoized `ensureDir()` in `services/files.ts`, so no start-up call order is needed, `plugins/testing.ts` and `embeddedText.fixtures.ts` (test helpers).

### 6. Per-folder lock for sidecar read-modify-write

New `services/folderLock.ts`: `withFolderLock(dir, fn)`, a keyed async mutex (map of promise chains, entry removed when idle). It is reentrant through `AsyncLocalStorage`: a call made while holding a folder's lock joins it, so `getFolderState` can lock internally while its callers hold the lock around "write, then apply". Used by:
- `SidecarService.updateFolderSidecar` (read → re-import `.ini` → mutate → atomic write);
- `SidecarService.getFolderState` when it re-imports a changed `.ini` and writes the sidecar;
- `savePhotoPatch` / `saveFolderByFolder` / album and people writers, around "write sidecar, then apply folder state to the library", so the library is updated in the order the writes happened;
- the scanner, which re-reads and applies each folder's files under the lock at the end of the initial scan and on watcher events, so it cannot overwrite a change saved meanwhile with a stale cached state.

The lock covers only Paloma's own concurrency; outside programs are still handled by atomic rename (unchanged) and the watcher. Locks are taken in sorted folder order (as `saveFolderByFolder` already sorts), so multi-folder saves cannot deadlock.

### 7. Database opening becomes an explicit async step

`db/index.ts` stops doing work at import: it exports `db` and `openDatabase(): Promise<void>`, which creates the data directory, opens the connection, sets pragmas and runs `db/columns.ts` migrations. `index.ts` awaits it before `app.listen`; tests call it in `beforeAll` (they already import `db` dynamically after setting `PALOMA_*`). All SQLite-only code — connection, `PRAGMA`, `db/columns.ts`, and raw `sql` fragments like `substr(date_taken, 1, 4)` in `memories.ts` — moves into or is referenced from `db/` (`db/sqlite.ts` with named helpers such as `yearOf(column)`), so a second backend has one directory to implement.

### 8. Async routes through one helper

`routes/asyncRoute.ts`: `asyncRoute(handler)` returns an Express handler that forwards a rejection to `next`, reaching the existing `apiErrorHandler`. All routes use it; the hand-written `try/catch` blocks go away. The export route also awaits `fs.promises.mkdir`; the movie route's frame loop is unchanged apart from async `mkdir`.

### 9. Scanner yields between photos

Indexing already runs one photo at a time on a promise queue. With async queries each step naturally yields; additionally the initial-scan "apply state to every folder" loop awaits each folder in turn (decision 3), so `GET /api/photos` and writes interleave with a long scan (see the folder-scanning spec delta).

### Files in the user's photo folders

Unchanged by this change — only how they are read:
- **Read:** photo files (streamed for the hash; header/pixels via sharp as today), directory listings, `.paloma.json`, the Picasa `.ini` (`.picasa.ini` / `Picasa.ini`).
- **Written:** only `.paloma.json`, via a temp file `.paloma.json.<pid>.<random>.tmp` in the same folder and an atomic rename, as today. No new files are created in photo folders.

### MVP code: reused, rewritten, dropped

- **Reused as is:** drizzle schema (`db/schema.ts`), table creation/migration SQL in `db/columns.ts`, all pure logic (`picasaIni` parsing, `SidecarService` merge/serialize/patch functions, `faceMatch`, `photoFilters`, `editChain`, `RenderService`, filter/plugin runtime), the atomic temp-file-and-rename write, the scanner's one-at-a-time queue and stability wait.
- **Rewritten (same behavior, async):** `db/index.ts` (explicit `openDatabase`), every DB call site in services and routes, `MetadataService.calculateFileHash`/`extractMetadata`, `SidecarService` I/O methods, `readPicasaIni` I/O, `ThumbnailService`/`faceImages` cache probes, `photoInfo` file listing, plugin `state`/`manifest`/`discovery`/`registry` I/O, `facesWithOwners`/`similarFaces`/`unassignedFaces`, `listFolders`, `applyFolderState`, `pruneFolders`, `removePhotos`.
- **Dropped:** `existsSync` probes before `sendFile` in `routes/index.ts`; per-route `try/catch` boilerplate.

## Risks / Trade-offs

- [The gate serializes all statements while a transaction is open, so a slow transaction stalls readers] → transaction bodies hold only DB work, batches are ≤ 500 rows; SQLite already serializes writers.
- [A forgotten `await` returns a pending promise instead of rows and compiles if types are loose] → the helpers return precise `Promise<T>` types, so using a result without `await` fails `tsc`; the project has no ESLint (no `no-floating-promises`), so an un-awaited write is caught only by the service tests, which assert on the database after each call.
- [Batching `applyFolderState` exposes a half-applied folder for a moment] → acceptable for a derived cache (decision 3); the batch order is deterministic and the next scan or watcher event converges.
- [The per-folder lock map can leak entries] → entries are deleted when their chain settles; a test checks the map is empty after concurrent saves.
- [Interleaving introduces races the sync code could not have, e.g. the watcher re-applying a folder while a PATCH saves] → decision 6 puts both under the same folder lock; spec scenarios in `sidecar-files` are tested with concurrent requests.
- [Hash mismatch would invalidate every cached thumbnail and re-index the library] → equality test against the one-shot hash on several fixture files and chunk sizes before switching.
- [Large diff touching most server files] → done in layers (db layer → files → services → routes) with the suite green after each layer; no behavior change means existing tests are the safety net.

## Migration Plan

No data migration: database schema, sidecar format and hash values are unchanged. Deploy is a normal server restart. Rollback is reverting the commit; the database and caches written by the new code are readable by the old one.

## Open Questions

- Batch size (500) and whether it should be configurable via `.env` — can be tuned after measuring on a large library without changing the approach.
