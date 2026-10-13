# Proposal

## Why

Long work in Paloma runs in separate, uncoordinated ways: the folder scan runs in the server in the background with no visible state, an AI run refuses a second run with 409, face detection runs only while one browser tab stays open, and an export holds the HTTP request until every file is written. On a shared server, users cannot see what the server is busy with, who started it, or line up their own work. One server-side task queue makes all long work visible, ordered and controllable.

## What Changes

- New server-side **task queue**. Folder scans, AI runs, face detection and photo exports become tasks. The server runs one task at a time, in queue order. Tasks are kept in the library database and survive a restart.
- Every logged-in user sees all tasks: kind, title, state, progress and who started it. Tasks of other users show the starter's display name and do not reveal which photos, folders or export destination they use. Scans are started by the system and shown as such.
- The owner of a task can **pause**, **resume** and **cancel** it, and **drag** their waiting tasks to reorder them among their own tasks. Other users' tasks keep their positions. A user with `users.manage` can do this to every task, including system scans, and can move any waiting task anywhere in the queue.
- A new **Tasks view**, opened from the user menu from the Easy level, lists the queue and recently ended tasks. A small progress indicator replaces the AI and face detection rings over the grid and opens the Tasks view.
- **Folder scanning** becomes queue tasks: the start-up scan of each configured folder, and the changes found by the watchers, run as system scan tasks placed before waiting user tasks.
- **AI runs** are queued instead of refused: **BREAKING** `POST /api/ai/runs` no longer responds 409 when a run exists; it responds 202 with the queued task. `GET /api/ai/runs/current` and `DELETE /api/ai/runs/current` are removed in favour of the tasks API. AI menus stay enabled while a run exists.
- **Face detection moves from the browser to the server**: it runs as a task with the same detector and models, keeps running when the browser is closed, and can be queued like other tasks. **BREAKING** the browser-only endpoints for pending photos and for uploading detected faces are removed.
- **Photo export** becomes a task: **BREAKING** `POST /api/export` responds 202 with the queued task; the written files and the quota result are reported when the task ends. Movies are unchanged.
- **MCP**: `start_ai_run` queues a run; `get_ai_run` and `cancel_ai_run` take a task id; a new `list_tasks` tool lists the queue; `export_photos` queues the export and waits for it to end.
- New tasks API: `GET /api/tasks`, `POST /api/tasks/:id/pause`, `POST /api/tasks/:id/resume`, `POST /api/tasks/:id/move`, `DELETE /api/tasks/:id`, `POST /api/faces/detect`.

## Capabilities

### New Capabilities
- `task-queue`: the server's queue of long-running tasks — what a task is, the order and one-at-a-time execution, states, who sees and controls which task, reordering, persistence across restarts, the tasks API and the Tasks view with its progress indicator.

### Modified Capabilities
- `folder-scanning`: scans and watcher changes run as system tasks in the queue.
- `ai-processing`: runs are queued instead of refused; progress, cancelling and the Runs API move to the task queue; AI menus are no longer disabled while a run exists.
- `face-recognition`: detection runs on the server as a queue task; the grid ring and browser-side cancel are replaced by the queue.
- `quotas`: an export is checked against the export space quota when it is queued and again while its task runs.
- `mcp-server`: AI tools work with queued tasks; new `list_tasks`; `export_photos` goes through the queue.
- `access-control`: `users.manage` also covers controlling every user's tasks.
- `user-menu`: new Tasks item and Tasks view opened from the user menu.
- `complexity-levels`: levels of the Tasks view and the task indicator.

## Impact

- Server: new task queue module and table in the library database; `ai/runner.ts` becomes a task kind; `FolderScannerService` hands scans and watcher batches to the queue; `exportApi.ts` runs inside a task; new server-side face detector (dependency `@vladmandic/face-api` with a WebAssembly TensorFlow backend, no native build).
- Client: Tasks view, task indicator, drag-and-drop ordering; AI and face rings replaced; browser face detection code and the `@vladmandic/face-api` client dependency and model copying removed; export dialog waits on its task.
- API: new `/api/tasks` endpoints and `POST /api/faces/detect`; changed `POST /api/ai/runs` and `POST /api/export`; removed `GET|DELETE /api/ai/runs/current`, `POST /api/faces/pending`, `PUT /api/photos/:id/detected-faces`.
- `shared/types.ts`: task types replace `AiRunStatus`.
- Docs: `docs/ai.md`, `docs/mcp.md`, `docs/users-and-auth.md` and a new `docs/task-queue.md`.
- Photo folders: no new files are read or written; tasks write exactly what the work they wrap wrote before.
