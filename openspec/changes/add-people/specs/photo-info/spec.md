# Spec Delta

## MODIFIED Requirements

### Requirement: People section
The panel SHALL list the people on the photo as described in the people capability, each with avatar and shown name, or say that no people are named on it. It SHALL offer adding a person to the photo, removing a person from it, and, for each unassigned detected face, a crop of the face with a choice of an existing person, a new named person or a new unknown person to assign it to.

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

### Requirement: Photo info API
`GET /api/photos/:id/info` SHALL respond with the photo as in photo lists, the file's path, size and modification time, the names of its albums, its people with their contact ids, whether they have an avatar and the rectangles of their faces, its unassigned detected faces with their ids and rectangles, its place name in the language given by `lang`, its EXIF fields, and its sidecar entry with where it comes from (`paloma`, `ini` or none) or that the sidecar is unreadable. An unknown id SHALL respond 404.

#### Scenario: Unknown photo
- **WHEN** a client sends `GET /api/photos/99999/info` and no such photo exists
- **THEN** the server responds 404

#### Scenario: Info reads the file without changing it
- **WHEN** a client sends `GET /api/photos/7/info`
- **THEN** the response contains the EXIF fields of photo 7, and no file in its folder is created or changed

#### Scenario: Unassigned faces
- **WHEN** photo 7 has two detected faces, one of them matching a mark of `Roy Avery`
- **THEN** the response lists `Roy Avery` among its people and one unassigned face, without any face descriptor
