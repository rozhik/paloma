# Spec Delta

## MODIFIED Requirements

### Requirement: Photo fields are stored in the sidecar
A photo entry SHALL store `"star": true` for a starred photo, `"hidden": true` for a hidden photo, `caption` as a non-empty string, `keywords` as a non-empty array of strings and `albums` as a non-empty array of album tokens. A field that is not set SHALL be absent. Paloma SHALL ignore a field of the wrong type for the library and SHALL keep it in the file until the user changes that field.

#### Scenario: All fields set
- **WHEN** the user stars and hides `a.jpg`, sets its caption to `Sunrise` and its keywords to `mountains` and `dawn`, and adds it to the album with token `c9ea`
- **THEN** the entry for `a.jpg` contains `"star": true`, `"hidden": true`, `"caption": "Sunrise"`, `"keywords": ["mountains", "dawn"]` and `"albums": ["c9ea"]`

#### Scenario: Field of the wrong type
- **WHEN** the entry for `a.jpg` contains `"star": "yes"`
- **THEN** `a.jpg` appears unstarred in the library and the file still contains `"star": "yes"`

### Requirement: Sidecar is created only by a user change
Paloma SHALL NOT create `.paloma.json` while scanning, indexing or watching a folder. It SHALL create it only when the user changes a photo field or an album in that folder. Paloma SHALL modify an existing `.paloma.json` only on a user change or to re-import a changed Picasa `.ini`.

#### Scenario: Scanning a folder
- **WHEN** a folder without `.paloma.json` is scanned and indexed, with or without a `.picasa.ini`
- **THEN** no `.paloma.json` is created in it

#### Scenario: First change in a folder
- **WHEN** the user stars a photo in a folder without `.paloma.json`
- **THEN** `.paloma.json` is created in that folder

#### Scenario: First album change in a folder
- **WHEN** the user adds a photo to an album in a folder without `.paloma.json`
- **THEN** `.paloma.json` is created in that folder

### Requirement: Supported Picasa fields are mapped
From a file section of the Picasa `.ini`, Paloma SHALL map: `star=yes` to star, `hidden=yes` to hidden, `caption` to caption, `keywords` (comma-separated, empty items dropped) to keywords, and `albums` (comma-separated tokens, empty items and duplicates dropped) to albums. Every other key of a file section, and every section other than file sections and `[.album:*]` sections, SHALL be ignored. A section SHALL match a file in the folder ignoring letter case. The entry is keyed by the file's name on disk, or by the section name if no file matches.

#### Scenario: Keywords and caption
- **WHEN** `.picasa.ini` has `[a.jpg]` with `caption= Sunrise ` and `keywords=mountains,,dawn`
- **THEN** `a.jpg` has caption ` Sunrise ` (spaces kept) and keywords `mountains` and `dawn`

#### Scenario: Section name in a different case
- **WHEN** `.picasa.ini` has `[IMG_0042.JPG]` with `star=yes` and the file on disk is `img_0042.jpg`
- **THEN** `img_0042.jpg` appears starred

#### Scenario: Album membership
- **WHEN** `.picasa.ini` has `[a.jpg]` with `albums=c9ea,7f01`
- **THEN** `a.jpg` is in the albums `c9ea` and `7f01`

#### Scenario: Unsupported keys
- **WHEN** a section has `filters=…`, `rotate=rotate(1)` and `backuphash=52410`
- **THEN** none of them affect the library or appear in `.paloma.json`

### Requirement: Unknown sidecar content is preserved
When Paloma writes `.paloma.json`, it SHALL keep unchanged every top-level section, every `photos` entry, every `albums` definition, and every key inside an entry or definition that it did not intend to change, including content it does not understand.

#### Scenario: Unknown keys survive a change
- **WHEN** `.paloma.json` contains `"people": {...}` at the top level, `"rotate": 90` in the entry for `a.jpg`, and `"extra": {...}` in an album definition, and the user stars `a.jpg`
- **THEN** the file still contains the same `people` section, `"rotate": 90` for `a.jpg` and the album's `extra`, and now also `"star": true`

### Requirement: Unreadable sidecar is never overwritten
If `.paloma.json` exists but is not valid JSON, has a `format` other than `"paloma-folder"`, has a `version` other than `2`, has `photos` that is not an object of objects, or has `albums` that is not an object of objects, Paloma SHALL NOT modify or replace it. Photos in that folder SHALL have no fields set, the Picasa `.ini` SHALL NOT be used instead, and an error naming the file SHALL be logged.

#### Scenario: MVP v1 sidecar
- **WHEN** a folder has a `.paloma.json` with `"version": "1.0"` and `"is_starred": true` for `a.jpg`
- **THEN** `a.jpg` appears unstarred in the library and the file is unchanged

#### Scenario: Newer version
- **WHEN** a folder has a `.paloma.json` with `"format": "paloma-folder"` and `"version": 3`
- **THEN** the file is unchanged and the error naming it is logged

#### Scenario: Malformed albums section
- **WHEN** a folder's `.paloma.json` has `"albums": ["Birds"]`
- **THEN** the folder's photos have no fields or albums in the library, and the file is unchanged
