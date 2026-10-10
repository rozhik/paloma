# Server data layer

The server never blocks the event loop on the database or the disk while it answers requests or scans folders. Queries go through a small async layer in [`server/src/db/query.ts`](../server/src/db/query.ts), files through `fs/promises`, and large tables and files are read in bounded pieces. This keeps the API responsive during a scan, and keeps SQLite-specific code in `server/src/db/`, so a MySQL or PostgreSQL backend has one directory to implement.

The guard test [`server/src/db/syncUsage.test.ts`](../server/src/db/syncUsage.test.ts) fails when one of these rules is broken.

## Queries

Build queries with drizzle as usual, and run them with the helpers instead of the builder's own `.all()`, `.get()` and `.run()`:

```ts
import { db } from '../db/index.js';
import { all, get, run } from '../db/query.js';

const rows = await all(db.select().from(photos).where(eq(photos.folderId, folderId)));
const photo = await get(db.select().from(photos).where(eq(photos.id, id)));
await run(db.update(photos).set({ isStarred: true }).where(eq(photos.id, id)));
```

The database opens with `await openDatabase()` from [`server/src/db/index.ts`](../server/src/db/index.ts), before the server listens. Tests call it in `beforeAll`, after pointing `PALOMA_DATA_DIR` at a temp folder.

## Transactions

```ts
await withTransaction(async (tx) => {
  await run(tx.delete(photoKeywords).where(eq(photoKeywords.photoId, id)));
  await run(tx.insert(photoKeywords).values(rows));
});
```

The transaction commits when the function resolves and rolls back when it throws. SQLite has one connection, so while a transaction is open every query from another caller waits until it ends; queries inside the function (and a nested `withTransaction`) run at once. The rules that follow from it:

- Query through the `tx` you are given, not `db`: on SQLite they are the same object, but another backend passes its own transaction.
- Keep only database work inside. Read and write files (sidecars, images) before or after, never inside: the connection is held for the whole call.
- Keep transactions short. Long work is split into batches, one transaction each.

## Bounded reads

- `eachBatch(size, (afterId, size) => query)` walks a table in pages ordered by id (`WHERE id > afterId ORDER BY id LIMIT size`) and lets the event loop run between pages. Applying a folder's files to the library and pruning folders use it, as does the walk over detected faces for similar and unassigned faces.
- `chunked(ids, size, (chunk) => query)` splits a caller-sized id list, so `inArray` never passes more parameters than a database allows (SQLite: 32 766, PostgreSQL: 65 535).
- `BATCH_SIZE` (500) is the default for both.
- Counts and sums are done in SQL (`GROUP BY`, `count()`), not by loading rows.

## Files

- Use `fs/promises`. To check that a file exists, use `fileExists()` from [`server/src/services/files.ts`](../server/src/services/files.ts), or just open it and handle `ENOENT`; `ensureDir()` creates a cache directory once per process.
- Routes send files with `sendFileOr404()` from [`server/src/routes/asyncRoute.ts`](../server/src/routes/asyncRoute.ts): a missing file answers a JSON 404 without probing first.
- Photo files are hashed as a stream (`MetadataService.calculateFileHash`), never read whole. The XXH64 value is the same as hashing the whole file at once, so it still names the cached thumbnails.
- `.paloma.json` and the Picasa `.ini` are small and read whole.

## Sidecar changes

A change to a folder's `.paloma.json` reads the file, changes it and writes it back. With async I/O two changes could interleave and one would be lost, so every read-modify-write of a folder runs under `withFolderLock(dir, fn)` from [`server/src/services/folderLock.ts`](../server/src/services/folderLock.ts):

- `SidecarService.updateFolderSidecar` and `getFolderState` (which may re-import a changed Picasa `.ini`) take the lock themselves.
- Code that writes a sidecar and then updates the library from it holds the lock across both, so the library follows the writes in order. A call made while holding a folder's lock joins it.
- Code that changes several folders takes their locks one at a time in sorted path order, as `saveFolderByFolder` does.

The lock covers Paloma's own requests and its folder watcher. Other programs are still covered by the atomic temp-file-and-rename write.

## Routes

Wrap async handlers in `asyncRoute()`. Express 4 does not catch a rejected promise itself; with the wrapper it reaches `apiErrorHandler` and answers 500 `internal`.

## Allowed synchronous calls

Only code that runs before the server listens, and test helpers:

- `server/src/config.ts`: finding `.env` and the repository root when the module loads.
- `server/src/plugins/testing.ts` and `server/src/services/embeddedText.fixtures.ts`: test helpers.
- Test files (`*.test.ts`) may use drizzle's synchronous calls to set up and inspect data.

## For a MySQL or PostgreSQL backend

What a second backend has to provide, all in `server/src/db/`:

- `openDatabase()` opening a pool instead of a file, and `connection()` / the transaction gate replaced by real transactions on a pooled connection.
- `all`, `get`, `run` that `await` the builder (`get` taking the first row), and `withTransaction` passing the driver's transaction object as `tx`.
- A drizzle schema for that dialect (`pg-core` or `mysql-core`) with the same table and column names as `schema.ts`, and table creation in place of `columns.ts`.
- The SQL fragments in [`server/src/db/sqlite.ts`](../server/src/db/sqlite.ts): `textPrefix` (`substr`, works as is), `containsText` (`instr` here; `strpos` in PostgreSQL, `instr` in MySQL) and `noRows` (`0` here; `false` in PostgreSQL).

Services do not change.
