# Spec Delta

## MODIFIED Requirements

### Requirement: Running a task on photos
A user with `ai.run` SHALL be able to run a ready task on a list of photos. The run SHALL be an `ai` task in the server's task queue, titled with the AI task's name, and SHALL continue when the browser is closed or reloaded. A run started while another task exists SHALL wait in the queue. Videos and photos the user cannot see SHALL be skipped.

#### Scenario: Run Tags on a folder
- **WHEN** a folder of 40 photos and 2 videos is shown and the user runs Tags on it
- **THEN** the server processes the 40 photos with the Tags task and skips the videos

#### Scenario: Second run
- **WHEN** a run is in progress and another user starts Objects
- **THEN** the server responds 202 with the Objects task waiting in the queue, and Objects starts when the first run ends

#### Scenario: Task not ready
- **WHEN** a client starts Tags while its provider is not configured
- **THEN** the server responds 400 saying that Tags is not ready

### Requirement: Run progress
A run SHALL report as its progress the photos done and the photos to process, e.g. `12 / 30`, and its failed photos. When the run ends, its summary SHALL say how many photos were processed, how many tags were added, how many photos failed and, when the provider reported them, how many tokens were used. The summary and the failures SHALL be shown only to the user who started the run and to users with `users.manage`.

#### Scenario: Progress after a reload
- **WHEN** a run of 30 photos has done 12 and the user reloads the page
- **THEN** the Tasks view shows the run at `12 / 30`

#### Scenario: Finished
- **WHEN** a Tags run over 30 photos ends after adding 95 tags with 2 photos failed
- **THEN** the message to the user who started it says 28 photos were processed, 95 tags were added and 2 photos failed

### Requirement: Cancelling and resuming a run
Cancelling or pausing a run SHALL stop it after the requests in progress end, without starting new ones. Each photo's result SHALL be saved as soon as it arrives, so that a cancelled or paused run, or a run interrupted by a server restart, loses at most the photos in progress. A resumed run, and a new run of the same task, SHALL skip the photos already done.

#### Scenario: Cancel and restart
- **WHEN** the user cancels a Tags run of 30 photos after 12 and runs Tags again on the same grid
- **THEN** the new run processes the remaining 18 photos

#### Scenario: Pause and resume
- **WHEN** the user pauses a Tags run of 30 photos after 12 and resumes it
- **THEN** the run processes the remaining 18 photos

### Requirement: Runs API
`POST /api/ai/runs` with a task id, photo ids and whether to run again SHALL add a run to the task queue and respond 202 with the queued task. It SHALL need `ai.run` and otherwise fail with 403; an unknown task SHALL fail with 404 and invalid photo ids with 400. Following, pausing and cancelling a run SHALL use the tasks API.

#### Scenario: Viewer starts a run
- **WHEN** auth is on and a viewer sends `POST /api/ai/runs`
- **THEN** the server responds 403 naming `ai.run`

#### Scenario: Queued run
- **WHEN** an editor sends `POST /api/ai/runs` for Tags while an export is running
- **THEN** the server responds 202 with a task of kind `ai`, titled Tags, in state `waiting`

### Requirement: AI menu in grid headers
Wherever a grid header offers Find faces, it SHALL also offer an AI menu, from the Normal level, to users with `ai.run`. The menu SHALL list the tasks offered in menus, each running on all photos the grid shows; tasks that are not ready SHALL be shown disabled with the reason. It SHALL offer Run again for each task, and to users with `plugins.manage` a link to the AI section. Tasks SHALL stay available while other runs exist; choosing one SHALL add a run to the queue.

#### Scenario: Run Objects from an album
- **WHEN** album `Trip` is shown and the user chooses Objects in its AI menu
- **THEN** Objects runs on all photos of `Trip`

#### Scenario: Easy level
- **WHEN** the level is Easy
- **THEN** no grid header offers the AI menu

#### Scenario: No configured provider
- **WHEN** `openai` is not configured and the user opens the AI menu
- **THEN** every task is disabled and says that its provider is not configured

#### Scenario: Run while another runs
- **WHEN** a Tags run is in progress and the user chooses Description in the AI menu
- **THEN** a Description run is added to the queue behind it
