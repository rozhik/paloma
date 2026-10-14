# object-changes Specification

## Purpose

Lets a script or an AI client change any writable attribute of photos, albums and people with one validated JSON changeset, applied with the same rules and folder files as the changes made in the UI.

## Requirements

### Requirement: Changeset format
`POST /api/changes` SHALL accept `{"changes": [...], "dryRun": false}`. Each change SHALL have `op` (`create`, `update` or `delete`) and `type` (`photo`, `album` or `person`); `update` and `delete` SHALL name objects with `id` or `ids`; `create` and `update` SHALL give values in `set`. A changeset SHALL have 1 to 1 000 changes naming at most 5 000 objects in all.

#### Scenario: Two changes in one request
- **WHEN** a client posts `{"changes": [{"op": "update", "type": "photo", "ids": [3, 7], "set": {"star": true}}, {"op": "update", "type": "album", "id": "c9ea", "set": {"name": "Birds"}}]}`
- **THEN** photos 3 and 7 are starred and album `c9ea` is named `Birds`

#### Scenario: Too many objects
- **WHEN** a changeset names 6 000 photos
- **THEN** the server responds 400 and nothing changes

### Requirement: Photo attributes that can be changed
An `update` of photos SHALL accept in `set`: `star`, `hidden`, `caption`, `tags`, `location`, `albums`, `people` and `edits`. The values SHALL follow the photo-text, geotags, albums, people and photo-edits capabilities: an empty caption clears it, tags drop empties and duplicates ignoring case, `location` is `{lat, lon}` or null, and edit steps are validated as when saving edits.

#### Scenario: Caption, tags and location
- **WHEN** a client updates photo 7 with `{"caption": "Sunrise", "tags": ["dawn", "", "Dawn", "hills"], "location": {"lat": 49.8397, "lon": 24.0297}}`
- **THEN** photo 7 has caption `Sunrise`, tags `dawn` and `hills`, and that location, and its `.paloma.json` entry has the same `caption`, `keywords` and `geotag`

#### Scenario: Edit step out of range
- **WHEN** a client updates photo 7 with `{"edits": [{"filter": "brightness", "amount": 500}]}`
- **THEN** the server responds 400 and photo 7's edits are unchanged

### Requirement: List attributes can be replaced or adjusted
For `tags`, `albums` and `people` of photos, `set` SHALL accept either an array, which replaces the list, or `{"add": [...], "remove": [...]}`, which adds missing items to the end and removes the named ones. Tags SHALL be compared ignoring case. Albums SHALL be given by token, people by contact id; a person MAY be added with a detected face as `{"person": id, "face": detectedFaceId}`.

#### Scenario: Add a tag to photos that differ
- **WHEN** photo 1 has tags `old`, `Trip` and photo 2 has none, and a client updates both with `{"tags": {"add": ["trip", "sea"]}}`
- **THEN** photo 1 has tags `old`, `Trip`, `sea` and photo 2 has `trip`, `sea`

#### Scenario: Assign a detected face
- **WHEN** photo 7 has detected face 17 and a client updates it with `{"people": {"add": [{"person": "b8e4117cf1d6615b", "face": 17}]}}`
- **THEN** the entry for photo 7 has a face of `b8e4117cf1d6615b` with face 17's rectangle

### Requirement: Album operations
A changeset SHALL create an album with `set` holding a non-empty `name`, optional `description` and `location`, and a non-empty `photos` list of photo ids. An `update` SHALL accept `name`, `description`, `location` and `cover` (a photo of the album, or null). A `delete` SHALL delete the album as the albums capability describes, without moving or deleting photo files.

#### Scenario: Create an album
- **WHEN** a client posts a change `{"op": "create", "type": "album", "set": {"name": "Trip", "photos": [3, 7]}}`
- **THEN** a new album `Trip` with photos 3 and 7 exists, and the result gives its token

#### Scenario: Album without photos
- **WHEN** a client creates an album with `"photos": []`
- **THEN** the server responds 400 and no album is created

### Requirement: Person operations
A changeset SHALL create, update and delete people. `set` SHALL accept `name`, `alias`, `comment`, `links`, `birth` and `gender`, validated as in the people capability; null SHALL clear a profile field. Deleting a person SHALL remove their faces from every photo entry, as `DELETE /api/people/:id` does.

#### Scenario: Invalid link
- **WHEN** a client updates a person with `{"links": ["javascript:alert(1)"]}`
- **THEN** the server responds 400 and the person is unchanged

### Requirement: Objects created in the same changeset
A `create` change MAY have a `ref` (letters, digits, `-` and `_`). Later changes in the same changeset SHALL be able to use `"@<ref>"` wherever an id of that album or person is expected. A ref used before its `create`, or defined twice, SHALL be rejected.

#### Scenario: New person on photos
- **WHEN** a changeset creates a person with `"ref": "ann"` and `{"name": "Ann"}` and then updates photos 3 and 7 with `{"people": {"add": ["@ann"]}}`
- **THEN** a new person `Ann` exists and photos 3 and 7 show her

#### Scenario: Ref used too early
- **WHEN** a change uses `"@ann"` before the change that creates `ann`
- **THEN** the server responds 400 naming that change and nothing changes

### Requirement: Read-only attributes are rejected
A `set` that names a read-only attribute (for example `fileName`, `width` or `photoCount`), an attribute the type does not have, or a type that cannot be changed (`folder`, `tag`) SHALL be rejected with 400 `read_only_field` or `invalid_field` naming the change and the field.

#### Scenario: Renaming a file
- **WHEN** a client updates photo 7 with `{"fileName": "new.jpg"}`
- **THEN** the server responds 400 `read_only_field` with the change index 0 and field `fileName`, and nothing changes

### Requirement: The whole changeset is checked before anything is written
Paloma SHALL validate every change, resolve every id and check every permission before writing anything. An invalid change SHALL respond 400, an unknown id or one the user cannot see 404, and a missing permission 403; the error SHALL name the change index and, where it applies, the field or permission. In each case nothing SHALL change.

#### Scenario: One bad change among many
- **WHEN** a changeset stars photos 3 and 7 and then updates an album that does not exist
- **THEN** the server responds 404 naming change 1, and photos 3 and 7 are not starred

### Requirement: Changes need the permissions of the matching endpoints
Changing `star`, `hidden`, `caption`, `tags`, `location` or `edits` of photos SHALL need `photos.edit`; album changes and photo `albums` SHALL need `albums.manage`; person changes and photo `people` SHALL need `people.manage`. Changes SHALL follow the library access rules of the access-control capability.

#### Scenario: Viewer token
- **WHEN** a request with a token that has only `library.view` posts a change that stars photo 7
- **THEN** the server responds 403 naming `photos.edit` and the photo is unchanged

#### Scenario: Editor without people rights
- **WHEN** a user with `photos.edit` but not `people.manage` updates photo 7 with `{"caption": "x", "people": {"add": ["b8e4117cf1d6615b"]}}`
- **THEN** the server responds 403 naming `people.manage` and the caption is unchanged

### Requirement: Dry run
With `"dryRun": true`, Paloma SHALL check the changeset as when applying it and respond with the same results, but SHALL write no file and change nothing in the library. Refs SHALL be shown as `"@<ref>"` instead of new ids.

#### Scenario: Preview of a large retag
- **WHEN** a client posts a changeset that adds the tag `sea` to 300 photos with `"dryRun": true`
- **THEN** the response lists what would change and no `.paloma.json` is created or changed

### Requirement: Change results
The response SHALL have `dryRun` and one result per change with `index`, `type`, the affected `ids` and `changes`: for each object whose values change, its id and each changed attribute with `from` and `to`, listing at most 200 objects per change and counting the rest in `more`. Values that would not change SHALL not be written, and SHALL leave the entry's `modified` unchanged.

#### Scenario: Starring an already starred photo
- **WHEN** photo 3 is starred, photo 7 is not, and a client stars both
- **THEN** the result lists only photo 7 with `"star": {"from": false, "to": true}`, and the entry of photo 3 is not rewritten

### Requirement: Changes are applied in order and saved folder by folder
Changes SHALL be applied in the order given, and each SHALL see the results of the earlier ones. Writes SHALL go only to `.paloma.json` files, folder by folder, as the sidecar-files and albums capabilities describe: an unreadable sidecar in any affected folder SHALL reject the changeset with 409 and write nothing; if writing a folder fails, the folders already written SHALL keep the changes and the response SHALL name the folders not changed.

#### Scenario: Corrupt sidecar
- **WHEN** a changeset changes photos in `/photos/a` and `/photos/b`, and `/photos/b/.paloma.json` is not valid JSON
- **THEN** the server responds 409 naming `/photos/b`, and neither folder's files nor the library change

#### Scenario: Same file as the endpoint
- **WHEN** one photo is changed with a changeset and an identical photo in another folder with `PATCH /api/photos/:id` to the same caption and tags
- **THEN** both `.paloma.json` entries have the same fields apart from `modified`

### Requirement: Text and list values have maximum sizes
A changeset SHALL refuse a value that is longer than its maximum length or has more items than its maximum, and SHALL name the field in the error. Changes are checked as a whole before anything is written, so a refused value changes nothing.

#### Scenario: Maximums per field
- **WHEN** a client reads the changeset schema
- **THEN** photo `caption` allows 2 000 characters; photo `tags` allows 200 tags of 100 characters; photo `albums` and `people` allow 200 items each; photo `edits` allows 100 steps; album `name` and `location` allow 200 characters and `description` 5 000; person `name` and `alias` allow 200 characters, `comment` 5 000; person `links` allow 20 links of 2 000 characters

#### Scenario: Caption too long
- **WHEN** a client updates photo 7 with a caption of 2 001 characters
- **THEN** the server responds 400 with code `invalid_field` and field `caption`, and nothing changes

#### Scenario: Too many tags
- **WHEN** a client updates photo 7 with 201 tags
- **THEN** the server responds 400 with code `invalid_field` and field `tags`, and photo 7's tags are unchanged

#### Scenario: Limit reached exactly
- **WHEN** a client updates photo 7 with a caption of exactly 2 000 characters
- **THEN** the caption is saved
