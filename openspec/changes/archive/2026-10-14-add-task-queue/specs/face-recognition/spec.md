# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Progress is shown as a ring over the grid`
- TO: `### Requirement: Detection progress`

## MODIFIED Requirements

### Requirement: Face detection is started from the grid
While the library grid shows photos, a user with `people.manage` SHALL be able to start face detection for all photos the grid shows, not only the visible ones. Detection SHALL run on the server as a `faces` task in the task queue, and SHALL continue when the browser is closed. Photos that were already detected with the current detector and have not changed since, videos, and photos the user cannot see SHALL be skipped.

#### Scenario: Detect a folder
- **WHEN** a folder of 40 photos, 10 of them already detected, is shown and the user starts face detection
- **THEN** a face detection task for the 30 other photos is added to the queue, and they are detected when it runs

#### Scenario: Second start
- **WHEN** a detection task is running and the user starts face detection on another folder
- **THEN** a second detection task waits in the queue behind it

#### Scenario: Browser closed
- **WHEN** the user starts detection on 500 photos and closes the browser
- **THEN** detection goes on, and the detected faces are there when the user comes back

### Requirement: Detection progress
A detection task SHALL report as its progress the photos done and the photos to detect, e.g. `12 / 30`, and its failed photos. When it ends, the message to the user who started it SHALL say how many faces were found on how many photos. Views showing detected faces SHALL show the new faces after the task ends without a reload.

#### Scenario: Progress
- **WHEN** 12 of 30 photos are done
- **THEN** the Tasks view shows the detection task at `12 / 30`, and the user can still scroll and open photos

#### Scenario: Finished
- **WHEN** the task finishes after finding 17 faces on 11 photos
- **THEN** the message says 17 faces were found on 11 photos

### Requirement: Detection can be cancelled and resumed
Cancelling or pausing a detection task SHALL stop it after the photo being detected. Each photo's result SHALL be saved as soon as that photo is done, so that a cancelled, paused or interrupted task, including a server restart, loses at most the photo in progress. A resumed task, and a new detection, SHALL skip the photos already done.

#### Scenario: Cancel and restart
- **WHEN** the user cancels a detection task of 30 photos after 12 and starts detection again on the same grid
- **THEN** the new task detects the remaining 18 photos

## ADDED Requirements

### Requirement: Detection API
`POST /api/faces/detect` with photo ids SHALL add a detection task for those of them that need detection and respond 202 with it, or 200 with no task when none needs it. It SHALL need `people.manage` and otherwise fail with 403; invalid photo ids SHALL fail with 400.

#### Scenario: Nothing to detect
- **WHEN** every listed photo was already detected with the current detector
- **THEN** the server responds 200 without a task and the client says that all photos are already detected

#### Scenario: Viewer starts detection
- **WHEN** auth is on and a viewer sends `POST /api/faces/detect`
- **THEN** the server responds 403 naming `people.manage`
