# Spec Delta

## MODIFIED Requirements

### Requirement: Photo document
A photo document SHALL have: `folder` (`id`, `name`: the last segment of the folder's path), `fileName`, `width`, `height`, `fileSize`, `takenAt` (or null), `star`, `hidden`, `caption` (or null), `tags`, `location` (`lat`, `lon`, or null), `locationSource`, `place` (or null), `albums` (`id`, `name`), `people` (`id`, `name`, `rect` or null), `detectedFaces` (`id`, `rect`), `edits` (steps as in photo-edits, `[]` without edits) and `modified`. A document SHALL NOT carry an absolute path of the server.

#### Scenario: Edited and tagged photo
- **WHEN** photo 42 in `/photos/trip` is starred, has the caption `Sunrise`, the tags `dawn` and `hills`, a user location 48.160833, 24.500278, is in album `Birds`, shows `Roy Avery` without a frame and has a sepia step
- **THEN** its document has `"star": true`, `"caption": "Sunrise"`, `"tags": ["dawn", "hills"]`, `"location": {"lat": 48.160833, "lon": 24.500278}`, `"locationSource": "user"`, `albums` with `Birds`, `people` with `Roy Avery` and `"rect": null`, `"edits": [{"filter": "sepia"}]`, `"modified": true` and `"folder": {"id": <folder id>, "name": "trip"}`, with no `path` in the document

#### Scenario: Untouched photo
- **WHEN** photo 7 has no sidecar entry and no embedded text
- **THEN** its document has `"star": false`, `"hidden": false`, `"caption": null`, `"tags": []`, `"edits": []` and `"modified": false`

### Requirement: Folder and tag documents
A folder document SHALL have `id`, `name` (its last path segment) and `photoCount`, and SHALL NOT have the path of the folder. A tag document SHALL have `name` and `photoCount` as in the tag list. Every attribute of folders and tags SHALL be read-only.

#### Scenario: Tag spelled two ways
- **WHEN** two photos have the tag `Dawn` and one has `dawn`
- **THEN** there is one tag document with `"id": "Dawn"`, `"name": "Dawn"` and `"photoCount": 3`

#### Scenario: Folder document
- **WHEN** a client reads folder 4 whose path is `/photos/trip`
- **THEN** the document has `"id": 4`, `"name": "trip"` and its `photoCount`, and no `path`
