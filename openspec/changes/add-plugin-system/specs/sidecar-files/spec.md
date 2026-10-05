# Spec Delta

## MODIFIED Requirements

### Requirement: Photo fields are stored in the sidecar
A photo entry SHALL store `"star": true` for a starred photo, `"hidden": true` for a hidden photo, `caption` as a non-empty string, `keywords` as a non-empty array of strings, `albums` as a non-empty array of album tokens, `geotag` as described in the geotags capability and `edits` as a non-empty array of edit steps as described in the photo-edits capability. A field that is not set SHALL be absent; only `geotag` may also be `null`, meaning the location was removed. Paloma SHALL ignore a field of the wrong type for the library and SHALL keep it in the file until the user changes that field.

#### Scenario: All fields set
- **WHEN** the user stars and hides `a.jpg`, sets its caption to `Sunrise` and its keywords to `mountains` and `dawn`, adds it to the album with token `c9ea`, and sets its location to 48.160833, 24.500278
- **THEN** the entry for `a.jpg` contains `"star": true`, `"hidden": true`, `"caption": "Sunrise"`, `"keywords": ["mountains", "dawn"]`, `"albums": ["c9ea"]` and `"geotag": { "lat": 48.160833, "lon": 24.500278 }`

#### Scenario: Field of the wrong type
- **WHEN** the entry for `a.jpg` contains `"star": "yes"`
- **THEN** `a.jpg` appears unstarred in the library and the file still contains `"star": "yes"`

#### Scenario: Edits stored
- **WHEN** the user rotates `a.jpg` right and applies sepia, and saves
- **THEN** the entry for `a.jpg` contains `"edits": [{ "filter": "rotate", "angle": 90 }, { "filter": "sepia" }]` and a `modified` timestamp

#### Scenario: Edits of the wrong type
- **WHEN** the entry for `a.jpg` contains `"edits": "sepia"` or an `edits` array with an item that has no string `filter`
- **THEN** `a.jpg` is shown without edits and the file is unchanged until the user saves edits for `a.jpg`

### Requirement: Library fields come from the sidecar
When a photo is indexed, its star, hidden flag, caption, keywords, geotag and edits in the library SHALL match its entry in a readable `.paloma.json` of its folder. A photo without an entry SHALL have none of these fields set, and its location SHALL come from its EXIF. If the folder has no `.paloma.json`, the fields SHALL come from the folder's Picasa `.ini` as described in "Picasa ini is shown live until the first change".

#### Scenario: Library rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"star": true` and `"caption": "Sunrise"`
- **THEN** `a.jpg` appears starred with caption `Sunrise`, and the other photos in the folder have no star, caption, keywords or hidden flag

#### Scenario: Geotag rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"geotag": { "lat": 50.45, "lon": 30.5234 }`
- **THEN** `a.jpg` has the location 50.45, 30.5234

#### Scenario: Edits rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"edits": [{ "filter": "bw" }]`
- **THEN** `a.jpg` has that edit and its thumbnail is black & white
