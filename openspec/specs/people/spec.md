# people Specification

## Purpose

Defines the people named on photos: how they are read from Picasa's faces and contacts, stored in the folder's `.paloma.json`, and named across folders. People are read-only in Paloma for now.

## Requirements

### Requirement: Faces are stored in photo entries
A photo entry's `faces` field SHALL be a non-empty array of faces. A face SHALL be an object with `rect` (as in the `crop64` filter: `left`, `top`, `right`, `bottom` as fractions of the photo) and either `person`, a contact id of 16 lowercase hex digits, or `"ignored": true`. Faces that are not of this shape SHALL be ignored for the library and kept in the file.

#### Scenario: Named face
- **WHEN** the entry for `a.jpg` has `"faces": [{"rect": {"left": 0.34, "top": 0.6, "right": 0.63, "bottom": 0.67}, "person": "b8e4117cf1d6615b"}]`
- **THEN** `a.jpg` has one face of the person `b8e4117cf1d6615b`

#### Scenario: Malformed face
- **WHEN** the entry for `a.jpg` has `"faces": [{"person": 5}]`
- **THEN** `a.jpg` has no people and the file is unchanged

### Requirement: People are stored in the sidecar
A sidecar's top-level `people` object SHALL map a contact id (16 lowercase hex digits) to an object with `name`, `email` and `googleId`, each a string or `null`. A definition of another shape SHALL be ignored for the library and kept in the file.

#### Scenario: Person definition
- **WHEN** a sidecar has `"people": {"b8e4117cf1d6615b": {"name": "Roy Avery", "email": null, "googleId": null}}`
- **THEN** the person `b8e4117cf1d6615b` is named `Roy Avery`

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
A person's shown name SHALL be the first non-null `name` for that contact id in folder path order, from readable sidecars or, for folders without a sidecar, their Picasa `.ini`. A person without a name SHALL be shown as "Unknown person" in the active language.

#### Scenario: Name defined in another folder
- **WHEN** `/photos/a/a.jpg` has a face of `b8e4117cf1d6615b` and only `/photos/b/.paloma.json` defines that person as `Roy Avery`
- **THEN** `a.jpg` shows `Roy Avery`

#### Scenario: Unknown contact
- **WHEN** a face names a contact id no folder defines
- **THEN** the person is shown as "Unknown person"

### Requirement: People on a photo
The people on a photo SHALL be the distinct persons of its faces that are not ignored, in face order. Paloma SHALL NOT offer adding, removing or renaming people or faces in this version, and SHALL keep `faces` and `people` unchanged when it writes a sidecar for other changes.

#### Scenario: Same person twice
- **WHEN** `a.jpg` has two faces of `Roy Avery`
- **THEN** the Info panel lists `Roy Avery` once

#### Scenario: Faces survive a star
- **WHEN** the entry for `a.jpg` has `faces` and the user stars `a.jpg`
- **THEN** the entry still has the same `faces`
