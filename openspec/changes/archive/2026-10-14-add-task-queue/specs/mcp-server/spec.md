# Spec Delta

## MODIFIED Requirements

### Requirement: Tools for AI tasks
`list_ai_tasks` SHALL return the AI tasks with their readiness. `start_ai_run` SHALL add a run of a task on given photos to the task queue and return the queued task. `get_ai_run` SHALL return the run with a given task id, or the caller's most recent run when none is given, with its state, progress and, to its owner, its summary. `cancel_ai_run` SHALL cancel the run with a given task id as the tasks API does. They SHALL need `ai.run`.

#### Scenario: Run Tags on photos
- **WHEN** a client with `ai.run` calls `start_ai_run` with task `tags` and photo ids 3 and 7
- **THEN** a run of Tags on those photos is queued, and `get_ai_run` with its task id reports its state and progress

#### Scenario: A run is in progress
- **WHEN** a run exists and a client calls `start_ai_run`
- **THEN** the new run is queued behind it and the tool result says it is waiting

#### Scenario: Cancel another user's run
- **WHEN** a client of `eve`, an editor, calls `cancel_ai_run` with the task id of `anna`'s run
- **THEN** the tool result is an error naming `users.manage`, and the run goes on

### Requirement: Tool export_photos
`export_photos` SHALL export the given photos into a folder inside the caller's export folder with the given quality and width, as the export API does, by adding an export task, waiting until it ends, and returning the written file paths relative to the export folder. It SHALL need `export` and follow the export space quota. When the task is cancelled, the tool result SHALL say so and list the files written.

#### Scenario: Destination outside the export folder
- **WHEN** a client calls `export_photos` with `outputDir` `../../etc`
- **THEN** the tool result is an error naming `outputDir` and nothing is written

#### Scenario: Export waits for the queue
- **WHEN** an AI task is running and a client calls `export_photos` with two photos
- **THEN** the tool returns after the export task has run, with the two written file paths

## ADDED Requirements

### Requirement: Tool list_tasks
`list_tasks` SHALL return the tasks as `GET /api/tasks` returns them to the caller. It SHALL need `library.view`.

#### Scenario: List the queue
- **WHEN** a Tags run of `anna` is running and an export of `ben` waits, and `ben`'s client calls `list_tasks`
- **THEN** the result lists the Tags run started by `anna` and then `ben`'s export, marked as his
