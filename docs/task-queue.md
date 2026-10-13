# Task queue

Long work runs on the server as **tasks** in one queue: scanning the photo folders, AI runs, finding faces and exporting photos. The server runs one task at a time, in queue order. Tasks keep running when the browser is closed, and they survive a restart.

## Kinds of tasks

| Kind | Started by | Unit of progress | Notes |
| :--- | :--- | :--- | :--- |
| `scan` | Paloma | files checked | One per configured folder at start-up; changes the watchers find later go to one waiting scan per folder |
| `ai` | **AI** menu, Info panel, MCP `start_ai_run` | photos | See [AI tasks](ai.md) |
| `faces` | **Find faces** | photos | Runs face-api on the server (WebAssembly, no native build), with the same detector id as the old browser detection |
| `export` | Export dialog, MCP `export_photos` | photos | Files go to the user's export folder; the [export quota](users-and-auth.md#quotas) is checked when the export is asked for and again while it runs |

Movies, geocoding and thumbnails are not tasks.

## Order and states

A task is `waiting`, `running`, `pausing`, `paused`, `cancelling`, `finished`, `cancelled` or `failed`.

- A user's new task goes to the end of the queue. A scan goes after the waiting scans and before every waiting user task, but does not interrupt the running task.
- **Pause**: a waiting task becomes `paused` at its place; the running one becomes `pausing`, finishes the units in progress, becomes `paused`, and the next task starts. **Resume** puts it back as `waiting`; it continues with what it has not done.
- **Cancel**: a waiting or paused task ends at once; the running one ends after the units in progress. Work already done is kept.
- A task that cannot go on (for example, an AI provider refusing the key five times in a row) is `failed` with the reason.
- After a restart, the running task waits again at the front of the user tasks, behind the start-up scans; paused tasks stay paused.
- Ended tasks are listed for 7 days, at most the newest 100.

## Who sees and changes what

- Everyone with `library.view` sees every task: kind, title, state, progress and who started it. Others' tasks hide their photos, export folder, files, errors and summary. A scan shows its folder only to users who see the whole library.
- The user who started a task can pause, resume, cancel and move it while they still have the permission to start such a task: `ai.run`, `people.manage` or `export`. They can remove their ended task from the list.
- An owner moves a task only among their own waiting and paused tasks; other users' tasks keep their places.
- Users with `users.manage` (and everyone with users off) control every task, scans included, and can move any waiting task anywhere.
- When a user is disabled or deleted, their tasks are cancelled.

## In the app

From the Easy level, **Tasks** in the user menu lists the queue and the ended tasks; drag a row (or use its arrows) to reorder. While you have tasks in the queue, a ring over the library shows the progress of your running task or how many of yours are waiting; it opens the Tasks view. A message sums up each of your tasks when it ends.

## API

| Request | What it does |
| :--- | :--- |
| `GET /api/tasks` | Running, waiting and paused tasks in queue order, then ended tasks (`library.view`) |
| `POST /api/tasks/:id/pause`, `/resume` | Pause or resume (409 `task_state` when the state does not allow it) |
| `POST /api/tasks/:id/move` `{before}` | Move before another task id, or to the end with `null` |
| `DELETE /api/tasks/:id` | Cancel, or remove an ended task |
| `POST /api/ai/runs`, `POST /api/faces/detect`, `POST /api/export` | Add a task; 202 with it (`/faces/detect`: 200 with `task: null` when every photo is already done) |

Changing someone else's task without `users.manage` is 403 naming `users.manage`; an own task without the kind's permission is 403 naming that permission.

Tasks are kept in the `tasks` table of the library database. Nothing is written to the photo folders beyond what the work itself writes.
