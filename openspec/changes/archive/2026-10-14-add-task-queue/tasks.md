# Tasks

## 1. Queue core and persistence

- [x] 1.1 Add `TaskKind`, `TaskState`, `TaskInfo`, `TaskDetails` and `TaskList` to `shared/types.ts`; verify with `npm run build`.
- [x] 1.2 Create the `tasks` table in `server/src/db/index.ts` and `db/schema.ts` (columns per design §2); `db` tests show the table exists on a fresh and on an existing database.
- [x] 1.3 Implement `server/src/tasks/queue.ts` (`TaskQueue`: enqueue at end, one-at-a-time loop, `pause`/`resume`/`cancel`/`remove`, `whenEnded`, throttled progress flush, state transitions with 409 on invalid ones) and the `TaskHandler` interface in `tasks/handlers.ts`; `queue.test.ts` covers order, single running task, paused task skipped, pause of running task → `pausing` → `paused` and next starts, cancel of waiting/running, failed state with message.
- [x] 1.4 Implement restart recovery and retention (running/pausing → waiting at front of user tasks, cancelling → cancelled, ended tasks pruned after 7 days or beyond 100); covered in `queue.test.ts` by reloading the queue from the table.
- [x] 1.5 Implement `move` (owner reorders within own slots; `users.manage` any position; running task not movable) with fractional positions and renumbering; `queue.test.ts` covers the spec scenarios "Swap two own tasks", "Cannot overtake others" and "Administrator moves a task to the front".

## 2. Permissions, visibility and API

- [x] 2.1 Implement `tasks/permissions.ts` (control rules of design §4, kind → permission map, system tasks admin-only, auth off allows all) and `redact()` for listings (others' tasks hide params, summary, failures; scan titles generic for limited access); `permissions.test.ts` covers each kind and the "Export of another user" and "Scan seen by limited access" scenarios.
- [x] 2.2 Add `server/src/routes/tasks.ts` (`GET /api/tasks`, `POST /api/tasks/:id/pause|resume|move`, `DELETE /api/tasks/:id`) and register guards; `routes/tasks.test.ts` covers 401 without session, 403 naming `users.manage` / the kind permission, 404 unknown, 409 resume of a running task, and removal of own ended tasks.
- [x] 2.3 Cancel a user's active tasks in `setUserEnabled(false)` and `deleteUser()` (`auth/users.ts`); test in `users.test.ts` that a waiting export of a deleted user is cancelled and writes nothing.

## 3. Scans as tasks

- [x] 3.1 Add `photos.file_size` and `photos.file_mtime` via `db/columns.ts`, filled on indexing; `FolderScannerService.test.ts` checks an unchanged file is skipped without hashing on a second full scan.
- [x] 3.2 Implement the `scan` handler (`tasks/scanTask.ts`): full mode walks the root with `scanPaths` filters and skips unchanged files; changes mode drains the root's pending watcher set; stops between files on pause/cancel; progress counts files checked. Tests: pause/resume indexes the rest, cancel keeps indexed photos.
- [x] 3.3 Rework `FolderScannerService.startConfiguredFolders()`: prune, enqueue one full scan per outer root as a system task, start watchers with `ignoreInitial: true`, route watcher events into per-root pending sets that create or join a waiting changes task; place scan tasks after waiting scans and before waiting user tasks. Update existing scanner tests; add tests for "More changes while waiting" and scan placement ahead of a waiting AI task.

## 4. AI runs as tasks

- [x] 4.1 Refactor `server/src/ai/runner.ts` into the `ai` task handler: keep per-photo processing, retries and fatal stop (→ task `failed`), honour `shouldStop()` for pause/cancel, resume over remaining photos (`again` keeps its index), AI summary in task `summary`. Update `routes/aiRuns.test.ts`: second run is queued with 202, pause/resume processes the remaining photos, cancel-and-rerun processes the rest.
- [x] 4.2 Change `POST /api/ai/runs` to respond 202 with the queued task and remove `GET|DELETE /api/ai/runs/current` from `routes/ai.ts`; tests confirm 403 for a viewer, 404 for an unknown task, 400 for invalid ids, 404 for the removed endpoints.

## 5. Face detection on the server

- [x] 5.1 Add `@vladmandic/face-api` and `@tensorflow/tfjs-backend-wasm` to `server/package.json`; implement `server/src/faces/detector.ts` (lazy WASM backend and model load, `sharp` decode of the face-source image, rect conversion moved from the client) keeping detector id `face-api-1.7/ssd-mobilenetv1/0.5`; a test detects a face on a fixture photo and returns fractions in 0..1.
- [x] 5.2 Implement the `faces` handler (`faces/detectTask.ts`) using the `pendingPhotos` and `saveDetectedFaces` logic internally, with per-photo saving, pause/cancel between photos and a summary of faces and photos; tests cover skip of already detected photos and resume after pause.
- [x] 5.3 Add `POST /api/faces/detect` (202 with task, 200 without task when nothing is pending, 403 naming `people.manage`, 400 invalid ids) and remove `POST /api/faces/pending` and `PUT /api/photos/:id/detected-faces`; update `access.test.ts` and route tests.

## 6. Export as a task

- [x] 6.1 Split `services/exportApi.ts` into request validation (400/409 synchronously) and per-file writing; implement the `export` handler (`services/exportTask.ts`) with space re-check at start and per file, cancel/pause between files, written files and `quotaExceeded` in the summary. Update `edits.test.ts` and `exportQuota.test.ts` for 202 responses, "Quota reached during an export" and "Space used up while waiting".
- [x] 6.2 Make MCP `export_photos` enqueue and await `whenEnded`, returning written paths or a cancelled result; update `mcp/tools.test.ts`.

## 7. MCP tools

- [x] 7.1 Change `start_ai_run` to return the queued task, `get_ai_run`/`cancel_ai_run` to take a task id (default: caller's most recent AI task) with the tasks API permission checks, and add `list_tasks`; `mcp/tools.test.ts` covers "A run is in progress" queueing and "Cancel another user's run" error naming `users.manage`.

## 8. Client

- [x] 8.1 Add `client/src/tasks/api.ts` and `useTasks.ts` (polling per design §9) and replace `client/src/api/ai.ts` run status calls; unit tests for the polling interval switch.
- [x] 8.2 Build `TasksView.tsx` (queue then ended tasks, starter name or Paloma, state, progress bar, Pause/Resume/Cancel/Remove, drag-and-drop plus keyboard Move up/down limited to allowed slots) and add the Tasks item to the user menu (level Easy, also with auth off); test that others' rows have no controls and that dropping calls `move` with the right `before`.
- [x] 8.3 Build `TaskIndicator.tsx` and `useTaskMessages.ts`, replacing the AI ring (`useAiRun`) and the face detection ring; end-of-task messages for scan/AI/faces/export; invalidate photo and face queries after tasks end. Update `useAiRun.test.ts` → tasks tests.
- [ ] 8.4 Remove browser face detection (`faces/detector.ts`, `faces/detectionRunner.ts`, model copy plugin in `vite.config.ts`, client `@vladmandic/face-api`), wire Find faces to `POST /api/faces/detect`, remove the "disabled while a run exists" logic from the AI menu, and make the export dialog close on 202; verify in the running app (`npm run dev`) that Find faces, an AI run and an export appear in the Tasks view.
- [x] 8.5 Register the Tasks view and indicator in `client/src/levels` (Easy) and add `en`/`uk` strings in `client/src/i18n`; test that at Child neither is shown.

## 9. Docs and verification

- [x] 9.1 Write `docs/task-queue.md` (kinds, states, ordering, permissions, API) and update `docs/ai.md`, `docs/mcp.md`, `docs/users-and-auth.md` and the AGENTS.md docs list.
- [x] 9.2 Run `npm run build` and `npm test` from the repo root and confirm both pass.
