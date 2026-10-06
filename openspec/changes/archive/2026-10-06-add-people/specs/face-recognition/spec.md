# Spec Delta

## Purpose

Finds faces on photos automatically, keeps what it finds as hidden library data, and helps the user mark a person on faces that look like them, without writing anything to folders until the user assigns a face.

## ADDED Requirements

### Requirement: Face detection is started from the grid
While the library grid shows photos, the user SHALL be able to start face detection for all photos the grid shows, not only the visible ones. Photos that were already detected with the current detector and have not changed since, and videos, SHALL be skipped. Only one detection run SHALL exist at a time.

#### Scenario: Detect a folder
- **WHEN** a folder of 40 photos, 10 of them already detected, is shown and the user starts face detection
- **THEN** the 30 other photos are detected

#### Scenario: Second start
- **WHEN** a detection run is in progress
- **THEN** starting face detection is not offered

### Requirement: Progress is shown as a ring over the grid
While detection runs, a circular progress indicator SHALL be drawn over the grid, showing the share of photos done and the count, e.g. `12 / 30`. The grid SHALL stay usable. Activating the indicator SHALL cancel the run; its accessible name SHALL be in the active language. When the run ends, the indicator SHALL disappear and a message SHALL say how many faces were found on how many photos.

#### Scenario: Progress
- **WHEN** 12 of 30 photos are done
- **THEN** the ring is 40% full and shows `12 / 30`, and the user can still scroll and open photos

#### Scenario: Finished
- **WHEN** the run finishes after finding 17 faces on 11 photos
- **THEN** the ring disappears and the message says 17 faces were found on 11 photos

### Requirement: Detection can be cancelled and resumed
Cancelling SHALL stop the run after the photo being detected. Each photo's result SHALL be saved as soon as that photo is done, so that a cancelled or interrupted run, including a page reload, loses at most the photo in progress, and a new run skips the photos already done.

#### Scenario: Cancel and restart
- **WHEN** the user cancels a run of 30 photos after 12 and starts detection again on the same grid
- **THEN** the new run detects the remaining 18 photos

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
