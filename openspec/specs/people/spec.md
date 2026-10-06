# people Specification

## Purpose

Defines the people named on photos: how they are read from Picasa's faces and contacts, stored in the folder's `.paloma.json`, and named across folders. People are read-only in Paloma for now.

## Requirements

### Requirement: Faces are stored in photo entries
A photo entry's `faces` field SHALL be a non-empty array of faces. A face SHALL be an object with either `person`, a contact id of 16 lowercase hex digits, and an optional `rect`, or `"ignored": true` and a `rect`. A `rect` is as in the `crop64` filter: `left`, `top`, `right`, `bottom` as fractions of the unedited photo. Faces that are not of this shape SHALL be ignored for the library and kept in the file.

#### Scenario: Named face
- **WHEN** the entry for `a.jpg` has `"faces": [{"rect": {"left": 0.34, "top": 0.6, "right": 0.63, "bottom": 0.67}, "person": "b8e4117cf1d6615b"}]`
- **THEN** `a.jpg` has one face of the person `b8e4117cf1d6615b`

#### Scenario: Mark without a rectangle
- **WHEN** the entry for `a.jpg` has `"faces": [{"person": "b8e4117cf1d6615b"}]`
- **THEN** `a.jpg` has the person `b8e4117cf1d6615b`, without a face rectangle

#### Scenario: Malformed face
- **WHEN** the entry for `a.jpg` has `"faces": [{"person": 5}]` or `"faces": [{"ignored": true}]`
- **THEN** `a.jpg` has no people and the file is unchanged

### Requirement: People are stored in the sidecar
A sidecar's top-level `people` object SHALL map a contact id (16 lowercase hex digits) to an object with `name`, `email` and `googleId`, each a string or `null`. A definition of another shape SHALL be ignored for the library and kept in the file. These definitions SHALL only provide names for people, as described in "A person's name is resolved across folders". Paloma SHALL NOT add, change or remove `people` definitions, except by importing a Picasa `.ini`.

#### Scenario: Person definition
- **WHEN** a sidecar has `"people": {"b8e4117cf1d6615b": {"name": "Roy Avery", "email": null, "googleId": null}}` and a face of `b8e4117cf1d6615b`, and the person was never edited in Paloma
- **THEN** the person `b8e4117cf1d6615b` is named `Roy Avery`

#### Scenario: Profile edit does not touch definitions
- **WHEN** the user renames `Roy Avery` to `Roy` in Paloma
- **THEN** every `.paloma.json` still has `"name": "Roy Avery"` in its `people` definition

### Requirement: Picasa faces and contacts are read
From a Picasa `.ini`, Paloma SHALL read a file section's `faces=` (`rect64(<hex>),<contactId>` items separated by `;`) as that photo's faces, padding hex values to 16 digits and lowercasing them; contact id `ffffffffffffffff` SHALL become `"ignored": true`. It SHALL read each `<contactId>=<name>;<email>;<googleId>` line of `[Contacts2]` as a person, with empty parts as `null`. Items that cannot be read, and contact lines without exactly three parts, SHALL be dropped.

#### Scenario: Face and contact
- **WHEN** `.picasa.ini` has `[Contacts2]` with `b8e4117cf1d6615b=Roy Avery;;` and `[a.jpg]` with `faces=rect64(579922efa1cce2aa),b8e4117cf1d6615b;rect64(502f02655e191250),ffffffffffffffff`
- **THEN** `a.jpg` shows the person `Roy Avery` once, and the second face is ignored

#### Scenario: Short contact id
- **WHEN** a face names contact `8e4117cf1d6615b`
- **THEN** it refers to the person `08e4117cf1d6615b`

#### Scenario: Contact with two parts
- **WHEN** `[Contacts2]` has `0123456789abcdef=Ann;ann@example.com`
- **THEN** no person `0123456789abcdef` is read from that line

### Requirement: People from a Picasa ini follow the import rules
While a folder has a Picasa `.ini` and no `.paloma.json`, its faces and people SHALL be shown live. The first change in the folder SHALL import faces into the entries and every `[Contacts2]` person into `people`. A re-import of a changed `.ini` SHALL treat `faces` like the other photo fields, SHALL replace the definitions of the people it lists, add new ones, and SHALL NOT remove any person.

#### Scenario: First change imports faces
- **WHEN** a Picasa folder names `Roy Avery` on `a.jpg` and the user stars `b.jpg`
- **THEN** `.paloma.json` contains `people.b8e4117cf1d6615b` with `"name": "Roy Avery"` and `a.jpg` with its `faces`

#### Scenario: Person renamed in Picasa
- **WHEN** after import `Roy Avery` is renamed to `Roy A.` in `.picasa.ini`
- **THEN** `.paloma.json` and the library show `Roy A.`

### Requirement: A person's name is resolved across folders
A person who was never edited in Paloma SHALL have as name the first non-null `name` for that contact id in folder path order, from readable sidecars or, for folders without a sidecar, their Picasa `.ini`, and SHALL follow changes of those files. Once the person is edited in Paloma, their name SHALL be the one saved in Paloma. A person without a name SHALL be shown as "Unknown person" in the active language.

#### Scenario: Name defined in another folder
- **WHEN** `/photos/a/a.jpg` has a face of `b8e4117cf1d6615b` and only `/photos/b/.paloma.json` defines that person as `Roy Avery`
- **THEN** `a.jpg` shows `Roy Avery`

#### Scenario: Unknown contact
- **WHEN** a face names a contact id no folder defines and the person was never edited in Paloma
- **THEN** the person is shown as "Unknown person"

#### Scenario: Paloma name wins
- **WHEN** the user renames `Roy Avery` to `Roy` in Paloma and later `.picasa.ini` renames the contact to `Roy A.`
- **THEN** the person is still shown as `Roy`

### Requirement: People on a photo
The people on a photo SHALL be the distinct persons of its faces that are not ignored, in face order. Paloma SHALL keep `faces` unchanged when it writes a sidecar for changes other than marks, and SHALL keep `people` unchanged except when importing a Picasa `.ini`.

#### Scenario: Same person twice
- **WHEN** `a.jpg` has two faces of `Roy Avery`
- **THEN** the Info panel lists `Roy Avery` once

#### Scenario: Faces survive a star
- **WHEN** the entry for `a.jpg` has `faces` and the user stars `a.jpg`
- **THEN** the entry still has the same `faces`

### Requirement: People are library records
Each person SHALL be a record in the library database identified by a contact id of 16 lowercase hex digits. A person SHALL be known when they have a name and unknown otherwise. Profiles SHALL be stored only in the library database and never in photo files or folder files.

#### Scenario: Database deleted
- **WHEN** the user gave `Roy Avery` an alias and a comment and the library database is deleted and the server restarted
- **THEN** `Roy Avery` is still shown on his photos with the name from the folder files, and has no alias or comment

### Requirement: People found in folders are added
When a folder is indexed, every contact id named by a face that is not ignored SHALL become a person if it is not one yet. This SHALL NOT create or change any file.

#### Scenario: Picasa contact becomes a person
- **WHEN** a folder with `.picasa.ini` naming `Roy Avery` on `a.jpg` is scanned for the first time
- **THEN** the People view lists `Roy Avery` with 1 photo and no file in the folder is created or changed

#### Scenario: Definition without faces
- **WHEN** a sidecar's `people` defines `0123456789abcdef` and no face names it
- **THEN** no person `0123456789abcdef` is listed

### Requirement: Known people have a profile
A known person SHALL have, besides the name, an optional alias, comment, list of profile links, birth date given as a year (`YYYY`) or a full date (`YYYY-MM-DD`), gender (`female` or `male`) and avatar. An unknown person SHALL offer only setting a name. Hidden face data of a person SHALL never be shown.

#### Scenario: Full profile
- **WHEN** the user sets `Roy Avery`'s alias `Roy`, comment `Uncle`, links `https://example.com/roy` and `https://social.example/roy`, birth `1961` and gender `male`
- **THEN** the person's editor shows all of them after a reload

#### Scenario: Unknown person editor
- **WHEN** the user edits an unknown person
- **THEN** the editor offers only the name field

#### Scenario: Naming an unknown person
- **WHEN** the user gives an unknown person the name `Ann`
- **THEN** the person is known and the editor offers the other profile fields

### Requirement: People API
`GET /api/people` SHALL list every person with contact id, name or `null`, alias, whether they have an avatar, and the number of not-hidden photos they are on. `POST /api/people` SHALL create a person with a new random contact id from optional profile fields. `GET`, `PATCH` and `DELETE /api/people/:id` SHALL read, change and delete one person. An unknown id SHALL respond 404.

#### Scenario: Create an unknown person
- **WHEN** a client sends `POST /api/people` with `{}`
- **THEN** the response is a person with a new 16-hex-digit contact id and no name

#### Scenario: Unknown id
- **WHEN** a client sends `GET /api/people/ffffffffffffff00` and no such person exists
- **THEN** the server responds 404

### Requirement: Profile values are validated
The name SHALL be trimmed and non-empty, and clearing the name of a known person SHALL be rejected. Profile fields SHALL be rejected for an unknown person unless the same request sets a name. Links SHALL be absolute `http` or `https` URLs, at most 20. The birth date SHALL be a valid year or date not in the future. A rejected request SHALL respond 400 and change nothing.

#### Scenario: Invalid link
- **WHEN** a client sends `PATCH /api/people/b8e4117cf1d6615b` with `{"links": ["javascript:alert(1)"]}`
- **THEN** the server responds 400 and the person is unchanged

#### Scenario: Impossible birth date
- **WHEN** a client sends `{"birth": "1990-02-30"}`
- **THEN** the server responds 400

#### Scenario: Clearing a name
- **WHEN** a client sends `{"name": "  "}` for `Roy Avery`
- **THEN** the server responds 400 and the person is still `Roy Avery`

### Requirement: People view
The People view SHALL show every person as a card with avatar, shown name, alias and photo count, known people first by name in the active language and then unknown people by photo count. It SHALL offer adding a person by hand, editing and deleting a person, and opening a person's photos.

#### Scenario: Add a person by hand
- **WHEN** the user adds a person named `Ann` in the People view
- **THEN** a card `Ann` with 0 photos appears and no file is created or changed

#### Scenario: Open a person
- **WHEN** the user opens the card of `Roy Avery`
- **THEN** the library grid shows the photos `Roy Avery` is on

### Requirement: People sidebar list
The sidebar SHALL have a People list with every person who is on at least one not-hidden photo, ordered as in the People view, each with avatar, shown name and photo count. Choosing a person SHALL show their photos in the grid like choosing a tag.

#### Scenario: Choose a person in the sidebar
- **WHEN** `Roy Avery` is on 3 photos, one of them hidden, and the user chooses `Roy Avery` in the sidebar
- **THEN** the list shows `Roy Avery` with 2, and the grid shows those 2 photos

### Requirement: Photos of a person
`GET /api/photos` SHALL accept `person`, a contact id, and SHALL return only photos with a face of that person, combined with the other filters. While a person is chosen, the grid header SHALL show the person's avatar and shown name, and SHALL offer editing the person.

#### Scenario: Search inside a person
- **WHEN** `Roy Avery` is chosen and the user searches `beach`
- **THEN** the grid shows only photos of `Roy Avery` that match `beach`

### Requirement: Marks are added and removed on a photo
The user SHALL be able to add a person to a photo, as a face without `rect`, to assign a detected face to a person, as a face with that face's `rect`, and to remove a person from a photo, which removes all of that person's faces from the entry. Each change SHALL be saved to the photo's `.paloma.json` entry with `modified`, as for other photo fields.

#### Scenario: Add a person without a rectangle
- **WHEN** the user adds `Ann` to `a.jpg`, which has no faces
- **THEN** the entry for `a.jpg` has `"faces": [{"person": "<Ann's id>"}]` and `modified`

#### Scenario: Assign a detected face
- **WHEN** a detected face on `a.jpg` with rect `{left: 0.1, top: 0.2, right: 0.3, bottom: 0.5}` is assigned to `Ann`
- **THEN** the entry for `a.jpg` gets the face `{"rect": {"left": 0.1, "top": 0.2, "right": 0.3, "bottom": 0.5}, "person": "<Ann's id>"}`

#### Scenario: Rectangle replaces a mark without one
- **WHEN** `a.jpg` has `{"person": "<Ann's id>"}` and a detected face on it is assigned to `Ann`
- **THEN** the entry has only the face with the rectangle for `Ann`

#### Scenario: Add a person twice
- **WHEN** `a.jpg` already has a face of `Ann` and the user adds `Ann` to `a.jpg`
- **THEN** the entry is unchanged

#### Scenario: Remove a person from a photo
- **WHEN** `a.jpg` has two faces of `Roy Avery` and one ignored face, and the user removes `Roy Avery` from it
- **THEN** the entry keeps only the ignored face and has `modified`

### Requirement: Mark changes fail if the sidecar cannot be written
A mark change SHALL take effect only after it is saved to `.paloma.json`. If the sidecar is unreadable or cannot be written, the people on the photo SHALL stay unchanged and the API SHALL respond with an error.

#### Scenario: Read-only folder
- **WHEN** the user adds `Ann` to a photo in a folder where the server cannot write files
- **THEN** the request fails and `Ann` is not on the photo

### Requirement: Deleting a person
Deleting a person SHALL remove all of their faces from every photo entry, setting `modified`, and then remove the person. Detected faces assigned to them SHALL become unassigned. `people` definitions SHALL stay. If a sidecar cannot be written, the person SHALL be kept with their remaining faces and the API SHALL respond with an error.

#### Scenario: Delete a person on two folders
- **WHEN** `Roy Avery` is on photos in `/photos/a` and `/photos/b` and the user deletes him after confirming
- **THEN** neither folder's entries have faces of `Roy Avery`, the person is no longer listed, and the `people` definitions are unchanged

#### Scenario: Delete a person nowhere marked
- **WHEN** the user deletes the person `Ann` who is on no photo
- **THEN** `Ann` is no longer listed and no file is changed

### Requirement: Avatar
A known person's avatar SHALL be a crop of one of their faces with a rectangle, taken from the unedited photo. The user SHALL choose it from all such faces of the person. Without a chosen avatar, or when the chosen face no longer exists, the avatar SHALL be the person's first face with a rectangle in folder path and file name order; without any, a placeholder. `GET /api/people/:id/avatar` SHALL return the avatar image or 404.

#### Scenario: Choose an avatar
- **WHEN** `Roy Avery` has faces with rectangles on `a.jpg` and `b.jpg` and the user chooses the one on `b.jpg`
- **THEN** his avatar everywhere is the crop of his face on `b.jpg`

#### Scenario: Chosen face removed
- **WHEN** the avatar face on `b.jpg` is removed from the photo
- **THEN** the avatar becomes the face on `a.jpg`

#### Scenario: No rectangles
- **WHEN** `Ann` is on photos only through marks without a rectangle
- **THEN** the avatar picker says there are no faces to choose from and a placeholder is shown

### Requirement: Face frames in the viewer
The viewer SHALL have a Faces toggle that draws the photo's face rectangles over it: marks with a rectangle, labelled with the person's shown name, and unassigned detected faces, drawn dashed and unlabelled. Ignored faces SHALL NOT be drawn. Frames SHALL follow zoom, pan and the photo's crop, rotate and flip edits. The toggle SHALL be remembered in this browser.

#### Scenario: Show faces
- **WHEN** `a.jpg` has a face of `Roy Avery` with a rectangle and one unassigned detected face, and the user turns Faces on
- **THEN** a frame labelled `Roy Avery` and a dashed unlabelled frame are drawn over the two faces

#### Scenario: Cropped photo
- **WHEN** `a.jpg` has a crop step and the user turns Faces on
- **THEN** the frames are drawn over the same faces in the cropped photo, and a face outside the crop is not drawn

#### Scenario: Zoom
- **WHEN** Faces is on and the user zooms to 200% and pans
- **THEN** the frames stay on the faces

#### Scenario: Remembered
- **WHEN** the user turns Faces on, closes the viewer and opens another photo
- **THEN** Faces is still on

### Requirement: Frames are hidden when edits move pixels otherwise
When the photo's enabled edits include a step that moves pixels other than crop, rotate and flip, such as straighten, the viewer SHALL draw no frames while Faces is on and SHALL say that face frames cannot be shown for this photo.

#### Scenario: Straightened photo
- **WHEN** `a.jpg` has a straighten step and Faces is on
- **THEN** no frames are drawn and the viewer says face frames cannot be shown for this photo

### Requirement: Assigning a face from its frame
Activating the frame of an unassigned detected face SHALL open the same person choice as in the Info panel; choosing a person SHALL assign the face to them, and the frame SHALL then show that person's name.

#### Scenario: Assign from a frame
- **WHEN** Faces is on and the user activates an unassigned frame and chooses `Ann`
- **THEN** the face is assigned to `Ann` and the frame is labelled `Ann`
