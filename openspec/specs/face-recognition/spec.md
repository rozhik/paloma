# face-recognition Specification

## Purpose

Finds faces on photos automatically, keeps what it finds as hidden library data, and helps the user mark a person on faces that look like them, without writing anything to folders until the user assigns a face.

## Requirements

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

### Requirement: Detection writes no files
Detected faces, their rectangles, scores and face descriptors SHALL be stored only in the library database. Face detection SHALL NOT create or change any file in the photo folders. Detecting a photo again SHALL replace its previous detected faces. Face descriptors SHALL NOT be shown in the UI or returned by the API.

#### Scenario: Detection on a Picasa folder
- **WHEN** face detection runs on a folder with `.picasa.ini` and no `.paloma.json`
- **THEN** no `.paloma.json` is created and `.picasa.ini` is unchanged

### Requirement: Detected faces match existing marks
A detected face whose rectangle covers a face mark of the same photo, with an intersection over union of at least 0.5, SHALL belong to that mark's person and SHALL NOT be shown as unassigned. Every other detected face that is not dismissed for every person SHALL be unassigned.

#### Scenario: Picasa face is detected
- **WHEN** `a.jpg` has a Picasa face of `Roy Avery` and detection finds a face with almost the same rectangle
- **THEN** the detected face belongs to `Roy Avery` and the Info panel shows no unassigned face for it

#### Scenario: New face
- **WHEN** detection finds a face on `a.jpg` that overlaps no mark
- **THEN** the Info panel of `a.jpg` shows it as an unassigned face

### Requirement: Similar faces mode
While the grid shows a person, the user SHALL be able to switch between their Photos and Similar faces. Similar faces SHALL show crops of unassigned detected faces on not-hidden photos whose distance to the closest detected face of the person is within the similarity threshold, most similar first, at most 200, excluding faces dismissed for this person.

#### Scenario: Similar faces of Roy
- **WHEN** `Roy Avery` has detected faces and the user switches his grid to Similar faces
- **THEN** the grid shows crops of unassigned faces that look like him, the most similar first

#### Scenario: Person without detected faces
- **WHEN** `Ann` has only marks without rectangles and the user switches to Similar faces
- **THEN** the grid says there are no faces of `Ann` to compare with and suggests running face detection on her photos

### Requirement: Marking similar faces
In Similar faces, the user SHALL be able to select faces and add the person's mark to them, which assigns each selected face to the person as described in the people capability, or dismiss them as not this person, which hides them from this person's Similar faces without changing any file. Opening a face SHALL open its photo in the viewer.

#### Scenario: Add Roy to three faces
- **WHEN** the user selects three faces in Roy's Similar faces and adds his mark
- **THEN** each of the three photos' entries gets a face of `Roy Avery` with that face's rectangle, and the three faces leave Similar faces and appear in Photos

#### Scenario: Not this person
- **WHEN** the user dismisses a face in Roy's Similar faces
- **THEN** it no longer appears in Roy's Similar faces, still appears in Ann's if it looks like her, and no file changes

#### Scenario: One folder cannot be written
- **WHEN** the user adds Roy's mark to two faces in different folders and one folder is read-only
- **THEN** the face in the writable folder is assigned, the other stays in Similar faces, and an error says one face could not be saved

### Requirement: Unrecognized faces in the People list
The sidebar's People list SHALL start with an "Unrecognized" entry while there are unassigned detected faces on not-hidden photos, showing how many there are. Choosing it SHALL show crops of those faces, most recent photos first, at most 500.

#### Scenario: Unrecognized entry
- **WHEN** face detection found 5 faces that belong to no person, one of them on a hidden photo
- **THEN** the People list starts with "Unrecognized" and the count 4, and choosing it shows those 4 faces

#### Scenario: Nothing unrecognized
- **WHEN** every detected face belongs to a person
- **THEN** the People list has no "Unrecognized" entry

### Requirement: Naming unrecognized faces
In the Unrecognized view, the user SHALL be able to select faces and choose who they are: an existing person, a new named person or a new unknown person. Each selected face SHALL then be assigned to that person as described in the people capability. Opening a face SHALL open its photo in the viewer.

#### Scenario: Name two faces at once
- **WHEN** the user selects two unrecognized faces and chooses a new person named `Ann`
- **THEN** `Ann` exists, both photos' entries get a face of `Ann` with those rectangles, and the two faces leave the Unrecognized view

### Requirement: Detection API
`POST /api/faces/detect` with photo ids SHALL add a detection task for those of them that need detection and respond 202 with it, or 200 with no task when none needs it. It SHALL need `people.manage` and otherwise fail with 403; invalid photo ids SHALL fail with 400.

#### Scenario: Nothing to detect
- **WHEN** every listed photo was already detected with the current detector
- **THEN** the server responds 200 without a task and the client says that all photos are already detected

#### Scenario: Viewer starts detection
- **WHEN** auth is on and a viewer sends `POST /api/faces/detect`
- **THEN** the server responds 403 naming `people.manage`
