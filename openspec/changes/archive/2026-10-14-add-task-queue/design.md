# Design

## Context

Today four kinds of long work run in four different ways (see proposal.md — Why):

- **Scanning** — `FolderScannerService.startConfiguredFolders()` starts a chokidar watcher per configured root; its initial `add` events and later `add`/`change`/`unlink` events go to a per-root promise chain (`queue = queue.then(job)`). Every file is hashed on every scan (`MetadataService` → `fileHash`); there is no stored size/mtime to skip unchanged files.
- **AI runs** — `server/src/ai/runner.ts` (`AiRunner`): one in-memory run, `409 ai_run_in_progress` for a second one, results saved per photo, progress via `GET /api/ai/runs/current`, polled by `client/src/ai/useAiRun.ts`. A run captures the starter's `LibraryAccess` and runs inside `runWithAccess`.
- **Face detection** — `client/src/faces/detectionRunner.ts` runs `@vladmandic/face-api` in the browser (WebGL), asks `POST /api/faces/pending`, loads `GET /api/photos/:id/face-source`, uploads `PUT /api/photos/:id/detected-faces`. Detector id `face-api-1.7/ssd-mobilenetv1/0.5`.
- **Export** — `services/exportApi.ts` `exportPhotos()` writes all files within the `POST /api/export` request.

Data lives in the SQLite library database (`server/src/db/index.ts` creates tables with `CREATE TABLE IF NOT EXISTS`, schema in `db/schema.ts`). Server data-layer rules in `docs/server-data-layer.md` apply (async queries, batches, no long transactions).

## Goals / Non-Goals

**Goals:**
- One in-process scheduler that owns the order, state and persistence of all long work.
- Each kind of work becomes a *task handler* that can stop at a safe point and continue from what is already done.
- No behavior change in what each kind of work writes.

**Non-Goals:**
- Running several tasks in parallel, or distributing tasks to other processes/machines.
- Movies (`POST /api/creation/movie`) and geocoding (`PlaceResolver` background lookups) stay outside the queue.
- Thumbnails generated on demand by image requests stay outside the queue.
- Push updates (SSE/WebSocket); the client polls.
- Progress of the units inside a task (e.g. per-photo partial progress).

## Decisions

### 1. One scheduler, handlers per kind
New module `server/src/tasks/`:
- `queue.ts` — `TaskQueue`: in-memory list mirrored to the `tasks` table, `enqueue`, `pause`, `resume`, `cancel`, `move`, `remove`, `list(principal)`, and a loop that starts the first `waiting` task when nothing runs.
- `handlers.ts` — `TaskHandler<P>` interface: `kind`, `prepare(params, principal)` (validates and computes the unit list at enqueue time), `run(ctx)` where `ctx` exposes `shouldStop()` (true while `pausing`/`cancelling`), `progress(done, total, failed)`, and `params` with its saved cursor; returns a summary.
- Handlers: `scan` (`tasks/scanTask.ts`), `ai` (refactored `ai/runner.ts`), `faces` (`faces/detectTask.ts`, new server module), `export` (`services/exportTask.ts` wrapping `exportPhotos`).

*Alternative*: keep each runner and add a global lock — rejected, because ordering, pausing and listing would have to be re-implemented four times.

### 2. Persistence: `tasks` table
Columns: `id` (uuid), `kind`, `title`, `owner_id` (nullable = system; no FK so ended tasks keep the name), `owner_name` (display name at creation, refreshed on read while the user exists), `state`, `position` (REAL, for cheap moves between neighbours), `params` (JSON: photo ids, task id, `again`, export options, root path, cursor), `total`, `done`, `failed`, `summary` (JSON), `error`, `created_at`, `started_at`, `ended_at`. Created in `db/index.ts` like the other tables. Writes are small single-row updates; progress is flushed at most once per second and on every state change.

On start: `running`/`pausing` → `waiting`, `cancelling` → `cancelled`; ended rows older than 7 days or beyond the newest 100 are deleted. Resumed tasks are placed at the front of the user tasks, behind the start-up scans (decision 5).

*Alternative*: a JSON file in the data directory — rejected; the DB already holds AI results and users, and the queue needs atomic position updates.

### 3. Resuming = recomputing the remaining units
Handlers do not keep fine-grained cursors where the data already says what is done:
- `ai`: `processedPhotos(taskId, fingerprint, ids)` already skips done photos; on resume the handler reruns with `again=false` over the remaining ids (it keeps the index of the last photo started when `again=true`, so Run again does not restart from zero).
- `faces`: skip photos whose `face_detections` row has the current detector and `fileHash` (today's `pendingPhotos` logic moves server-side).
- `export`: params keep the index of the next photo; written files are listed in the summary as they are written.
- `scan`: re-walks the root and skips unchanged files (decision 5).

`done` is kept across pause/resume so progress keeps showing e.g. `12 / 30`.

### 4. Access and permissions
- A task stores the owner's `LibraryAccess` snapshot at enqueue (as `AiRunner` does) and runs inside `runWithAccess`; scans run with full access (no wrapper, as today).
- Control check (`tasks/permissions.ts`): allowed if auth is off, or principal has `users.manage`, or (principal owns the task and has the kind's permission: `ai`→`ai.run`, `faces`→`people.manage`, `export`→`export`). System tasks: only `users.manage` or auth off. Missing permission → 403 naming it (`users.manage` when not the owner).
- `move` for non-admins: take the set of positions held by the owner's `waiting`/`paused` tasks, reorder only those tasks within that set. `before` must be another own task or `null` (= last own slot); otherwise 403 `users.manage`. Admins: `before` any waiting/paused task or `null` (end of queue); position = midpoint between neighbours, renumbered when gaps get too small.
- Listing (`list(principal)`) redacts others' tasks to `{id, kind, title, state, total, done, failed, ownerName, mine:false, createdAt, startedAt, endedAt}`; scan titles become the generic "Library scan" for users whose access is not the whole library. Own tasks (and all tasks for `users.manage`) include `params` view and `summary`.
- `users.ts`: `setUserEnabled(false)` and `deleteUser()` call `taskQueue.cancelOwnedBy(userId)`.

### 5. Scans as tasks
- Watchers start with `ignoreInitial: true`; `startConfiguredFolders()` prunes as today, then enqueues one `scan` task per configured outer root (`params.mode = 'full'`), then starts the watchers.
- Watcher events are put in a per-root pending set (`path → add|change|unlink`). If no `scan` task for that root is `waiting`, one is enqueued with `mode = 'changes'`; the handler drains the set when it runs (so events arriving while it waits join it). Events arriving while a changes-task is *running* go into a fresh set and a new task.
- A full scan walks the root with the existing filters (`scanPaths.ts`), lists files sorted, and for each file compares `size` and `mtimeMs` with new `photos.file_size` / `photos.file_mtime` columns (added with the existing column-migration helper in `db/columns.ts`); unchanged files are skipped without hashing. This makes resume and a restart after a cancel cheap. Progress counts files checked.
- Placement: a new scan task gets a position just after the last waiting scan task and before the first waiting user task.
- `waitUntilStable`, `withFolderLock`, sidecar handling and `refreshFolder` are reused unchanged inside the handler.

*Alternative*: keep watcher events outside the queue and only queue the start-up scan — rejected; the user asked for scanning to be a task, and a single writer avoids scans and AI tag writes racing on the same `.paloma.json`.

### 6. Face detection on the server
- Dependency: `@vladmandic/face-api` (same 1.7 line as the client) with its `node-wasm` build and `@tensorflow/tfjs-backend-wasm` — no native compilation (fits the "rebuild native modules" caution in memory; only `better-sqlite3`/`sharp` stay native). Models loaded from `node_modules/@vladmandic/face-api/model` on first use.
- Input: the same image as `GET /api/photos/:id/face-source` (`photoFaceSource()`), decoded with `sharp` to raw RGB and wrapped in a tensor; rectangles converted to fractions as `toFaceInput()` does today (moved to the server).
- Detector id stays `face-api-1.7/ssd-mobilenetv1/0.5`, so photos the browser already detected are not detected again. Results saved through the existing `saveDetectedFaces` logic (called internally with the current `fileHash`).
- Removed: `client/src/faces/detector.ts`, `detectionRunner.ts`, the face-model copy plugin in `client/vite.config.ts`, the client `@vladmandic/face-api` dependency, `POST /api/faces/pending`, `PUT /api/photos/:id/detected-faces`. Kept: `GET /api/photos/:id/face-source` (used by face crops).

*Alternative*: keep detection in the browser and represent it as a "client task" — rejected by the user's choice; it cannot run when the tab is closed and cannot be paused by the server.

### 7. Export as a task
`POST /api/export` validates `photoIds`, `outputDir` (via `resolveInside`) and the "space already full" check synchronously (400/409 as today), then enqueues. The handler re-checks space when it starts and per file (`fits`/`requireSpace`), stopping with `quotaExceeded` in the summary. `exportPhotos()` is split into `prepareExport()` and `writeExportFile()` so the handler can stop between files. MCP `export_photos` enqueues and awaits `taskQueue.whenEnded(id)`.

### 8. API and types
- `shared/types.ts`: `TaskKind`, `TaskState`, `TaskInfo` (redacted shape), `TaskDetails` (own/admin: `params` summary, `summary`, `failures`), `TaskList { tasks: TaskInfo[] }`. `AiRunInfo`/`AiRunStatus` are replaced by `TaskInfo` with an AI `summary` (`tagsAdded`, `descriptionsSet`, `inputTokens`, `outputTokens`, `failures`).
- Routes in `server/src/routes/tasks.ts`: `GET /tasks` (`library.view`), `POST /tasks/:id/pause|resume`, `POST /tasks/:id/move {before}`, `DELETE /tasks/:id` (logged in; checks per decision 4). `POST /faces/detect` (`people.manage`). `routes/ai.ts` drops `GET|DELETE /ai/runs/current`. Guards table (`guards.test.ts`) updated.
- Errors: `task_not_found` 404, `task_state` 409 (with current state), `forbidden` 403 naming the permission.

### 9. Client
- `client/src/tasks/`: `api.ts`, `useTasks.ts` (TanStack Query, polls `GET /api/tasks` every 2 s while the Tasks view or an own active task exists, else every 15 s), `TasksView.tsx`, `TaskIndicator.tsx` (replaces the AI ring from `useAiRun` and the face ring), `useTaskMessages.ts` (shows a toast when an own task moves to an ended state; replaces the per-feature end messages; invalidates photo/face queries after `scan`, `ai` and `faces` tasks).
- Drag and drop: native HTML5 drag events plus keyboard Move up/Move down buttons for accessibility, no new library. Non-draggable rows for tasks the user cannot move; drop targets limited to allowed slots.
- User menu gets Tasks (level Easy); levels registry updated; i18n strings in `en` and `uk`.
- AI menu: drop the "disabled while a run exists" logic. Find faces: calls `POST /api/faces/detect`. Export dialog: closes after 202 and relies on the task message.

### Files in the photo folders
No new reads or writes. Scans read photo files, `.paloma.json` and `.picasa.ini` exactly as today; AI tasks write `.paloma.json` only where tags/descriptions were already written; face detection reads photos and writes nothing to folders; exports write only in the export folder.

### MVP code reuse
- **Reused**: `AiRunner` processing logic (per-photo processing, retries, fatal stop), `saveDetectedFaces`/`pendingPhotos` logic, `exportPhotos` internals, `FolderScannerService` indexing, sidecar and lock code, `scanPaths` filters, `runWithAccess`.
- **Rewritten**: `AiRunner` lifecycle (single `current` run → task handler), scanner start-up and watcher dispatch, export route, client AI progress (`useAiRun`) and face detection store.
- **Dropped**: browser face detection, face-model copying in Vite, `ai/runs/current` endpoints, `faces/pending` and `detected-faces` upload endpoints.

## Risks / Trade-offs

- [A long AI task delays new photos from appearing] → scans are placed ahead of waiting user tasks; administrators can pause the running task. Accepted trade-off of a single queue.
- [Face detection in WASM on the server is slower than WebGL in a browser and uses server CPU] → one task at a time bounds load; models loaded lazily; detector id unchanged so existing detections are reused.
- [Breaking API for scripts using `ai/runs/current` or synchronous export] → documented in `docs/ai.md`/`docs/mcp.md`; MCP `export_photos` keeps its synchronous contract by waiting.
- [Progress writes on every photo stress SQLite] → throttle progress flushes to 1/s.
- [New size/mtime columns empty for existing photos] → first full scan after upgrade hashes everything once (same cost as today) and fills them.
- [Redaction mistakes leak photo/folder names to other users] → listing goes through one `redact()` function with tests for each kind.

## Migration Plan

1. On first start, `tasks` table and `photos.file_size`/`file_mtime` columns are created; nothing to convert (the in-memory AI run had no persistence).
2. Deploy server and client together; old clients calling `ai/runs/current` get 404 until reloaded.
3. Rollback: the previous version ignores the `tasks` table and new columns.
