# Spec Delta

## Purpose

Defines the server's queue of long-running tasks — folder scans, AI runs, face detection and photo exports: how they are ordered and run one at a time, which states they go through, who sees and controls which task, and how the queue survives a restart and is shown in the app.

## ADDED Requirements

### Requirement: Tasks
Long work SHALL run on the server as a task. A task SHALL have an id, a kind (`scan`, `ai`, `faces` or `export`), a title, the user who started it or the system, a state, progress as done and total units, counts of failed units, a summary when it ends, and the times it was created, started and ended. A task SHALL keep running when the browser that started it is closed or reloaded.

#### Scenario: Export keeps running
- **WHEN** `anna` exports 200 photos and closes her browser
- **THEN** the export task goes on, and when `anna` logs in again the Tasks view shows it with its progress or result

### Requirement: One task runs at a time, in queue order
The server SHALL run at most one task at a time. Waiting tasks SHALL form one ordered queue. When no task runs, the server SHALL start the first waiting task. A new task started by a user SHALL be added at the end of the queue. A paused task SHALL NOT start until it is resumed.

#### Scenario: Two runs
- **WHEN** `anna` starts Tags on a folder while `ben`'s export is running
- **THEN** the Tags task waits, and starts when the export ends

#### Scenario: Paused first task is skipped
- **WHEN** the first waiting task is paused and the running task ends
- **THEN** the next waiting task that is not paused starts

### Requirement: Task states
A task SHALL be in exactly one state: `waiting`, `running`, `pausing`, `paused`, `cancelling`, `finished`, `cancelled` or `failed`. `finished`, `cancelled` and `failed` SHALL be ended states. A task SHALL be `failed` when it could not go on, with a message saying why.

#### Scenario: Provider refuses the key
- **WHEN** an AI task stops because five photos in a row failed with a refused key
- **THEN** the task is `failed` and its message shows the provider's error

### Requirement: Pausing and resuming a task
Pausing a waiting task SHALL make it `paused` at its position. Pausing the running task SHALL make it `pausing`, let the units in progress end, then make it `paused` and start the next waiting task. Resuming SHALL make a paused task `waiting` at its position, and it SHALL continue with the units it has not done.

#### Scenario: Pause and resume a running AI task
- **WHEN** `anna` pauses her Tags task after 12 of 30 photos, and later resumes it when it is first in the queue
- **THEN** the task processes the remaining 18 photos, and progress shows `12 / 30` while it is paused

#### Scenario: Others go ahead while paused
- **WHEN** `anna`'s running task is paused and `ben`'s export is waiting behind it
- **THEN** `ben`'s export starts

### Requirement: Cancelling a task
Cancelling a waiting or paused task SHALL make it `cancelled` at once. Cancelling the running task SHALL make it `cancelling`, let the units in progress end without starting new ones, then make it `cancelled`. Work already done by a cancelled task SHALL be kept.

#### Scenario: Cancel a running export
- **WHEN** `ben` cancels his export of 50 photos after 20 were written
- **THEN** the task is `cancelled` with 20 photos done, and the 20 files stay in his export folder

### Requirement: Reordering own tasks
The user who started a task SHALL be able to move it among their own waiting and paused tasks. The positions of other users' tasks and of system tasks SHALL NOT change. The running task SHALL NOT be moved.

#### Scenario: Swap two own tasks
- **WHEN** the queue is `anna:Tags`, `ben:Export`, `anna:Objects` and `anna` moves Objects before Tags
- **THEN** the queue is `anna:Objects`, `ben:Export`, `anna:Tags`

#### Scenario: Cannot overtake others
- **WHEN** the queue is `ben:Export`, `anna:Tags` and `anna` tries to move Tags before `ben`'s export
- **THEN** the server responds 403 and the order is unchanged

### Requirement: Administrators control every task
A user with `users.manage` SHALL be able to pause, resume, cancel and move every task, including system tasks, and to move a waiting or paused task to any position in the queue. With auth off, the user SHALL control every task the same way.

#### Scenario: Administrator moves a task to the front
- **WHEN** the queue is `ben:Export`, `carol:Tags` and an administrator moves `carol`'s Tags before `ben`'s export
- **THEN** `carol`'s Tags starts before `ben`'s export

#### Scenario: Editor cancels another user's task
- **WHEN** `eve`, an editor, cancels `anna`'s task
- **THEN** the server responds 403 naming `users.manage`, and the task is unchanged

### Requirement: Controlling own tasks needs the kind's permission
A user SHALL control their own task only while they have the permission needed to start a task of its kind: `ai.run` for `ai`, `people.manage` for `faces` and `export` for `export`. Otherwise the request SHALL get 403 naming that permission.

#### Scenario: Permission removed
- **WHEN** `ben`'s role loses `export` while his export waits, and `ben` cancels it
- **THEN** the server responds 403 naming `export`

### Requirement: Everyone sees all tasks
Every user with `library.view` SHALL see all waiting, running, paused and recently ended tasks with their kind, title, state, progress, times and who started them. A task started by another user SHALL show that user's display name; a system task SHALL show that it was started by Paloma. The user's own tasks SHALL be marked as theirs.

#### Scenario: Viewer sees an editor's run
- **WHEN** `eve` (display name `Eve Avery`) runs Tags and `ben`, a viewer, opens the Tasks view
- **THEN** `ben` sees the Tags task with progress and `Eve Avery` as who started it, and no pause, cancel or move controls on it

### Requirement: Others' tasks reveal no photos
For a task of another user, the user SHALL see only its kind, title, state, progress, failed count, times and starter. They SHALL NOT see its photo ids, export destination, written files, failure details or summary. The title of an AI task SHALL be the AI task's name, of a face detection or export task the kind and the number of photos, and of a scan task the folder's name only to users with access to the whole library.

#### Scenario: Export of another user
- **WHEN** `ben` exports 12 photos to `holiday` and `anna` lists the tasks
- **THEN** `anna` sees an export of 12 photos by `ben`, without `holiday` or the file names

#### Scenario: Scan seen by limited access
- **WHEN** `/photos/private` is being scanned and `ben` has access to album `Trip` only
- **THEN** `ben` sees a library scan task without the folder name

### Requirement: Tasks survive a restart
Waiting, paused and running tasks SHALL be kept in Paloma's data directory. After a restart, a task that was running SHALL be `waiting` at the front of the user tasks, and SHALL continue with the units it had not done. Paused tasks SHALL stay paused. Tasks SHALL NOT be written to the photo folders.

#### Scenario: Restart during an AI task
- **WHEN** the server restarts while a Tags task has done 12 of 30 photos
- **THEN** after the start-up scans, the Tags task runs again and processes the remaining 18 photos

### Requirement: Ended tasks are kept for a while
Ended tasks SHALL stay listed, newest first, for 7 days, and at most the 100 most recent ones. The user who started a task SHALL be able to remove their ended task from the list.

#### Scenario: Old task drops out
- **WHEN** a task ended 8 days ago
- **THEN** it is no longer listed

### Requirement: Tasks of a disabled or deleted user
When a user is disabled or deleted, their waiting, paused and running tasks SHALL be cancelled. Their ended tasks SHALL keep showing their display name.

#### Scenario: Delete a user with waiting tasks
- **WHEN** an administrator deletes `ben` while his export waits
- **THEN** the export is `cancelled` and nothing is written

### Requirement: Tasks API
`GET /api/tasks` SHALL return the running, waiting and paused tasks in queue order and then the ended tasks, as the user may see them. `POST /api/tasks/:id/pause`, `POST /api/tasks/:id/resume` and `DELETE /api/tasks/:id` SHALL pause, resume and cancel a task, or remove an ended one. `POST /api/tasks/:id/move` with `before` (a task id, or null for the end) SHALL move it. An unknown task SHALL get 404, and a change not allowed in its state SHALL get 409.

#### Scenario: Resume a running task
- **WHEN** a client sends `POST /api/tasks/:id/resume` for a running task
- **THEN** the server responds 409 and the task is unchanged

#### Scenario: List needs library.view
- **WHEN** auth is on and a client without a session requests `GET /api/tasks`
- **THEN** the server responds 401

### Requirement: Tasks view
From the Easy level, the user menu SHALL open a Tasks view listing the running task, the waiting and paused tasks in queue order, and then the ended tasks. Each row SHALL show the title, the starter, the state and a progress bar with done and total. Rows the user may control SHALL offer Pause or Resume, Cancel, and dragging to move. The view SHALL update while it is open, and all its texts SHALL be in the active UI language.

#### Scenario: Drag own task
- **WHEN** `anna` drags her Objects task above her Tags task in the Tasks view
- **THEN** the order is saved on the server and every open Tasks view shows Objects before Tags

#### Scenario: Others' rows cannot be dragged
- **WHEN** `anna`, an editor, opens the Tasks view with `ben`'s export waiting
- **THEN** `ben`'s row offers no Pause, Cancel or drag handle

### Requirement: Task indicator
From the Easy level, while the user has a waiting, running, pausing or paused task, the library SHALL show a circular indicator over the grid with the share done of the user's running task, or the number of their waiting tasks. The grid SHALL stay usable. Activating the indicator SHALL open the Tasks view. When the user's task ends, a message SHALL give its summary.

#### Scenario: Own task waits
- **WHEN** `anna`'s Tags task waits behind `ben`'s export
- **THEN** `anna`'s indicator shows that one task is waiting, and opens the Tasks view when activated

#### Scenario: Task ends
- **WHEN** `anna`'s export of 12 photos finishes
- **THEN** the indicator disappears and a message says 12 photos were exported
