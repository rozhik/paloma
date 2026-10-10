# Proposal

## Why

The server does its file and database work synchronously: `better-sqlite3` queries through drizzle's `.all()/.get()/.run()` (about 100 call sites), `fs.*Sync` reads and writes of sidecars, Picasa `.ini` files and the thumbnail cache, and a whole-file `readFileSync` to hash every photo. Each of these blocks the event loop, so a large scan or a big sidecar transaction stalls every other request, and a multi-gigabyte file is held in memory just to hash it. The synchronous style also ties every service to SQLite: MySQL and PostgreSQL drivers are asynchronous only, so the code cannot move to them without first becoming asynchronous.

This change makes server I/O asynchronous and bounded in memory, so that the next steps — event-loop tuning and a MySQL/PostgreSQL backend — become changes to one layer instead of to every service.

## What Changes

- All database access goes through an asynchronous data layer: services `await` queries and never call drizzle's synchronous `.all()/.get()/.run()` or `better-sqlite3` directly. SQLite stays the only backend.
- Transactions become asynchronous (`withTransaction(async (tx) => …)`) and are serialized on the single SQLite connection, so an awaited query from another request can never land inside an open transaction.
- SQLite-specific code (connection, pragmas, table creation/migration helpers in `db/columns.ts`, raw `sql\`…\`` fragments such as `substr`) is gathered behind the data layer, so a future backend replaces one module.
- Queries that read whole tables (`pruneFolders`, `listFolders`' per-folder count, `facesWithOwners` for similar/unassigned faces, `shownPeople`, album copies) read in bounded batches or push the work into SQL (`GROUP BY`, `LIMIT`) instead of loading every row.
- File access uses `fs/promises`; `existsSync` checks before `sendFile` or a cache lookup are replaced by handling `ENOENT`.
- Photo hashing streams the file in chunks; the hash value stays byte-for-byte the same, so existing thumbnail caches and library rows remain valid.
- Sidecar read-modify-write is serialized per folder, so concurrent changes to photos of one folder are all kept now that the read and the write no longer happen in one synchronous step.
- Long scan work (applying a folder's state to thousands of photos) is split into batches that yield to the event loop between them.
- HTTP routes become async handlers with errors passed to the existing `apiErrorHandler`.
- No API, sidecar format or configuration changes. Not in scope: adding a MySQL/PostgreSQL driver, replacing hand-written table creation with drizzle-kit migrations, worker threads, `UV_THREADPOOL_SIZE` tuning.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `folder-scanning`: adds a requirement that the library API keeps answering while a scan or re-index runs.
- `sidecar-files`: adds a requirement that concurrent changes to photos of the same folder are all saved, none lost.

## Impact

- **Server code**: `server/src/db/*`, every service under `server/src/services/` that queries the database or touches files (`FolderScannerService`, `SidecarService`, `MetadataService`, `ThumbnailService`, `picasaIni`, `photoApi`, `albumApi`, `peopleApi`, `people`, `faceDetectionApi`, `faceImages`, `geoApi`, `memories`, `tagApi`, `placeCache`, `PlaceResolver`, `folderChanges`, `photoInfo`, `renderApi`), `server/src/routes/index.ts`, `server/src/plugins/{state,manifest,discovery,registry}.ts`.
- **Tests**: server tests that call `db.….run()` or the now-async service functions are updated to `await`.
- **Dependencies**: none added; `better-sqlite3`, `drizzle-orm` and `xxhashjs` stay.
- **Client, shared types, API, `.paloma.json`, `.env`**: unchanged.
