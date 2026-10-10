## MODIFIED Requirements

### Requirement: File section
The panel SHALL show the file name, the folder it is in as an entry link, the full path on disk, the file size in the active language's number format with a unit (B, KB, MB, GB, base 1024), the pixel dimensions, the date taken, and the file's last modification time.

#### Scenario: File facts
- **WHEN** the user opens Info for `/photos/trip/IMG_0042.JPG`, 3 524 812 bytes, 4000×3000
- **THEN** the panel shows `IMG_0042.JPG`, `/photos/trip/IMG_0042.JPG`, `3.4 MB` (formatted for the active language) and `4000 × 3000`

#### Scenario: Open the folder
- **WHEN** the user opens Info for `/photos/trip/IMG_0042.JPG` and chooses the folder link `trip`
- **THEN** the viewer closes and the library shows folder `trip`

### Requirement: Albums section
The panel SHALL list the albums the photo is in as entry links with their shown names, with untitled albums shown as untitled, or say that the photo is in no album.

#### Scenario: Two albums
- **WHEN** the photo is in `Birds` and `Trip`
- **THEN** the Albums section lists `Birds` and `Trip`

#### Scenario: Open an album
- **WHEN** the Albums section lists `Trip` and the user chooses it
- **THEN** the viewer closes and the library shows album `Trip`

### Requirement: People section
The panel SHALL list the people on the photo as described in the people capability, each with avatar and shown name as an entry link, or say that no people are named on it. It SHALL offer adding a person to the photo, removing a person from it, and, for each unassigned detected face, a crop of the face with a choice of an existing person, a new named person or a new unknown person to assign it to.

#### Scenario: Person from Picasa
- **WHEN** Picasa faces name `Roy Avery` on the photo
- **THEN** the People section lists `Roy Avery`

#### Scenario: Add a person
- **WHEN** the user adds `Ann` in the People section of `a.jpg`
- **THEN** the section lists `Ann` and the entry for `a.jpg` has a face of `Ann` without a rectangle

#### Scenario: Assign a face to a new person
- **WHEN** `a.jpg` has an unassigned detected face and the user assigns it to a new person named `Bob`
- **THEN** the person `Bob` exists, the section lists `Bob`, and the face is no longer shown as unassigned

#### Scenario: Remove a person
- **WHEN** the user removes `Roy Avery` in the People section
- **THEN** `Roy Avery` is no longer listed and the entry has no faces of `Roy Avery`

#### Scenario: Open a person
- **WHEN** the People section lists `Roy Avery` and the user chooses his name
- **THEN** the viewer closes and the library shows the photos of `Roy Avery`

## ADDED Requirements

### Requirement: Tag chips link to the tag
Each tag chip in the panel SHALL show the tag icon and SHALL be an entry link to that tag, separate from its remove button. Choosing the remove button SHALL only remove the tag.

#### Scenario: Open a tag
- **WHEN** the photo has the tag `river` and the user chooses the chip's name
- **THEN** the viewer closes and the library shows the photos tagged `river`

#### Scenario: Remove does not navigate
- **WHEN** the user chooses the remove button of the chip `river`
- **THEN** the photo no longer has `river` and the viewer stays open
