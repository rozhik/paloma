# Spec Delta

## Purpose

Gives every library object — photo, album, person, folder and tag — one JSON document shape with a published, AI-readable schema, so scripts and AI clients can read the library and know which attributes they may change.

## ADDED Requirements

### Requirement: Object types and ids
Paloma SHALL describe its library as documents of five types: `photo`, `album`, `person`, `folder` and `tag`. Every document SHALL have `type` and `id`. The id SHALL be the photo id (number), the album token, the person's contact id, the folder id (number) and, for a tag, its shown name.

#### Scenario: Ids of each type
- **WHEN** a client reads photo 42, album `c9ea9fa67022f38a3c771894d2a8a468`, person `b8e4117cf1d6615b`, folder 3 and tag `dawn`
- **THEN** their documents have `"type"` `photo`, `album`, `person`, `folder` and `tag`, and `"id"` `42`, `"c9ea9fa67022f38a3c771894d2a8a468"`, `"b8e4117cf1d6615b"`, `3` and `"dawn"`

### Requirement: Photo document
A photo document SHALL have: `folder` (`id`, `path`), `fileName`, `width`, `height`, `fileSize`, `takenAt` (or null), `star`, `hidden`, `caption` (or null), `tags`, `location` (`lat`, `lon`, or null), `locationSource`, `place` (or null), `albums` (`id`, `name`), `people` (`id`, `name`, `rect` or null), `detectedFaces` (`id`, `rect`), `edits` (steps as in photo-edits, `[]` without edits) and `modified`.

#### Scenario: Edited and tagged photo
- **WHEN** photo 42 in `/photos/trip` is starred, has the caption `Sunrise`, the tags `dawn` and `hills`, a user location 48.160833, 24.500278, is in album `Birds`, shows `Roy Avery` without a frame and has a sepia step
- **THEN** its document has `"star": true`, `"caption": "Sunrise"`, `"tags": ["dawn", "hills"]`, `"location": {"lat": 48.160833, "lon": 24.500278}`, `"locationSource": "user"`, `albums` with `Birds`, `people` with `Roy Avery` and `"rect": null`, `"edits": [{"filter": "sepia"}]` and `"modified": true`

#### Scenario: Untouched photo
- **WHEN** photo 7 has no sidecar entry and no embedded text
- **THEN** its document has `"star": false`, `"hidden": false`, `"caption": null`, `"tags": []`, `"edits": []` and `"modified": false`

### Requirement: Album document
An album document SHALL have `name` (or null), `date` (or null), `description` (or null), `location` (or null), `cover` (the cover photo id, or null) and `photoCount` (not-hidden photos), as the album list shows them.

#### Scenario: Album with a chosen cover
- **WHEN** album `Birds` has 12 photos, description `Spring migration` and the user chose photo 7 as its cover
- **THEN** its document has `"name": "Birds"`, `"description": "Spring migration"`, `"cover": 7` and `"photoCount": 12`

### Requirement: Person document
A person document SHALL have `name` (or null for an unknown person), `alias`, `comment`, `links`, `birth`, `gender`, `hasAvatar` and `photoCount` (not-hidden photos with the person). Profile fields that are not set SHALL be null, and `links` SHALL be `[]`.

#### Scenario: Unknown person
- **WHEN** a person created from a detected face has no name
- **THEN** the document has `"name": null`, `"links": []` and null profile fields

### Requirement: Folder and tag documents
A folder document SHALL have `path`, `name` (its last path segment) and `photoCount`. A tag document SHALL have `name` and `photoCount` as in the tag list. Every attribute of folders and tags SHALL be read-only.

#### Scenario: Tag spelled two ways
- **WHEN** two photos have the tag `Dawn` and one has `dawn`
- **THEN** there is one tag document with `"id": "Dawn"`, `"name": "Dawn"` and `"photoCount": 3`

### Requirement: Read one document
`GET /api/objects/:type/:id` SHALL respond with that object's document. An unknown type SHALL respond 400; an unknown id, or an object the user cannot see, SHALL respond 404. It SHALL need `library.view` and SHALL change no file.

#### Scenario: Unknown photo
- **WHEN** a client requests `GET /api/objects/photo/99999` and no such photo exists
- **THEN** the server responds 404

#### Scenario: Unknown type
- **WHEN** a client requests `GET /api/objects/camera/1`
- **THEN** the server responds 400 naming the field `type`

### Requirement: List documents
`GET /api/objects/:type` SHALL respond with `items` (documents) and `total` (all matching objects). For photos it SHALL accept the selection parameters of `GET /api/photos` and order photos as photo lists do; other types SHALL be ordered as their lists in the UI. `limit` SHALL default to 100 and be at most 500; `offset` SHALL default to 0. A list SHALL contain only objects the user can see.

#### Scenario: Page of a tag
- **WHEN** 230 photos that are not hidden have the tag `dawn` and a client requests `GET /api/objects/photo?tag=dawn&limit=100&offset=200`
- **THEN** the response has 30 items and `"total": 230`

#### Scenario: Limit too large
- **WHEN** a client requests `GET /api/objects/photo?limit=5000`
- **THEN** the server responds 400 naming the field `limit`

#### Scenario: Limited library access
- **WHEN** `ben` may see only `/photos/family` and requests `GET /api/objects/folder`
- **THEN** the items are only folders he can see, and `total` counts only them

### Requirement: Model schema
`GET /api/schema` SHALL respond with a JSON Schema (draft 2020-12) defining every document type and the changeset. Every property SHALL have an English `description` that says what it means, its units and ranges, and how it is changed. Properties that cannot be changed SHALL be marked `readOnly: true`. It SHALL need `library.view`.

#### Scenario: Caption is described and writable
- **WHEN** a client requests `GET /api/schema`
- **THEN** the photo definition's `caption` property has a description and no `readOnly`, and its `fileName` property is `readOnly: true`

#### Scenario: Schema validates real documents
- **WHEN** any document returned by `GET /api/objects/...` is validated against the schema's definition for its type
- **THEN** it is valid

### Requirement: Schema lists the available filters
The edit-step part of the schema SHALL list one definition per filter of the active plugins, with its name, label, parameters, their types, ranges and defaults. Steps of other filters SHALL be allowed as objects with a string `filter`, as the photo-edits capability keeps them.

#### Scenario: Plugin switched off
- **WHEN** the plugin with the `sepia` filter is switched off and a client requests `GET /api/schema`
- **THEN** the schema has no `sepia` definition, and a step `{"filter": "sepia"}` is still valid

### Requirement: AI guide
`GET /api/schema/guide` SHALL respond with an English Markdown guide for AI clients that explains the object types and ids, how to find photos, how to write a changeset with an example, that hidden photos are left out unless asked for, that dry runs should be used before large changes, that changes go to `.paloma.json` and never to photo files, and the list of available filters. It SHALL need `library.view`.

#### Scenario: Guide follows the plugins
- **WHEN** a plugin with the filter `vignette` is switched on
- **THEN** the guide lists `vignette` among the available filters
