# Spec Delta

## MODIFIED Requirements

### Requirement: Photo fields are stored in the sidecar
A photo entry SHALL store `"star": true` for a starred photo, `"hidden": true` for a hidden photo, `caption` as a non-empty string, `keywords` as a non-empty array of strings, `albums` as a non-empty array of album tokens and `geotag` as described in the geotags capability. A field that is not set SHALL be absent; only `geotag` may also be `null`, meaning the location was removed. Paloma SHALL ignore a field of the wrong type for the library and SHALL keep it in the file until the user changes that field.

#### Scenario: All fields set
- **WHEN** the user stars and hides `a.jpg`, sets its caption to `Sunrise` and its keywords to `mountains` and `dawn`, adds it to the album with token `c9ea`, and sets its location to 48.160833, 24.500278
- **THEN** the entry for `a.jpg` contains `"star": true`, `"hidden": true`, `"caption": "Sunrise"`, `"keywords": ["mountains", "dawn"]`, `"albums": ["c9ea"]` and `"geotag": { "lat": 48.160833, "lon": 24.500278 }`

#### Scenario: Field of the wrong type
- **WHEN** the entry for `a.jpg` contains `"star": "yes"`
- **THEN** `a.jpg` appears unstarred in the library and the file still contains `"star": "yes"`

### Requirement: Library fields come from the sidecar
When a photo is indexed, its star, hidden flag, caption, keywords and geotag in the library SHALL match its entry in a readable `.paloma.json` of its folder. A photo without an entry SHALL have none of these fields set, and its location SHALL come from its EXIF. If the folder has no `.paloma.json`, the fields SHALL come from the folder's Picasa `.ini` as described in "Picasa ini is shown live until the first change".

#### Scenario: Library rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"star": true` and `"caption": "Sunrise"`
- **THEN** `a.jpg` appears starred with caption `Sunrise`, and the other photos in the folder have no star, caption, keywords or hidden flag

#### Scenario: Geotag rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"geotag": { "lat": 50.45, "lon": 30.5234 }`
- **THEN** `a.jpg` has the location 50.45, 30.5234

### Requirement: Supported Picasa fields are mapped
From a file section of the Picasa `.ini`, Paloma SHALL map: `star=yes` to star, `hidden=yes` to hidden, `caption` to caption, `keywords` (comma-separated, empty items dropped) to keywords, `albums` (comma-separated tokens, empty items and duplicates dropped) to albums, and `geotag` (`lat,lon` in decimal degrees, within range) to geotag. Every other key of a file section, a `geotag` that is not two numbers in range, and every section other than file sections and `[.album:*]` sections, SHALL be ignored. A section SHALL match a file in the folder ignoring letter case. The entry is keyed by the file's name on disk, or by the section name if no file matches.

#### Scenario: Keywords and caption
- **WHEN** `.picasa.ini` has `[a.jpg]` with `caption= Sunrise ` and `keywords=mountains,,dawn`
- **THEN** `a.jpg` has caption ` Sunrise ` (spaces kept) and keywords `mountains` and `dawn`

#### Scenario: Section name in a different case
- **WHEN** `.picasa.ini` has `[IMG_0042.JPG]` with `star=yes` and the file on disk is `img_0042.jpg`
- **THEN** `img_0042.jpg` appears starred

#### Scenario: Album membership
- **WHEN** `.picasa.ini` has `[a.jpg]` with `albums=c9ea,7f01`
- **THEN** `a.jpg` is in the albums `c9ea` and `7f01`

#### Scenario: Picasa geotag
- **WHEN** `.picasa.ini` has `[a.jpg]` with `geotag=33.770556,-84.293055`, and the user later stars another photo in the folder
- **THEN** `a.jpg` has the location 33.770556, -84.293055 before and after the change, and `.paloma.json` contains `"geotag": { "lat": 33.770556, "lon": -84.293055 }` for `a.jpg`

#### Scenario: Malformed Picasa geotag
- **WHEN** `.picasa.ini` has `[a.jpg]` with `geotag=north,east` and `a.jpg` has EXIF GPS
- **THEN** `a.jpg` has the EXIF location

#### Scenario: Unsupported keys
- **WHEN** a section has `filters=…`, `rotate=rotate(1)` and `backuphash=52410`
- **THEN** none of them affect the library or appear in `.paloma.json`

### Requirement: Photo fields can be changed through the API
`PATCH /api/photos/:id` SHALL accept any of `isStarred` (boolean), `isHidden` (boolean), `caption` (string), `keywords` (array of strings) and `location` (as described in the geotags capability), and SHALL respond with the updated photo. An empty caption or keyword list SHALL clear the field. Keywords SHALL drop empty strings and duplicates, keeping first order. An empty body or a wrong type SHALL be rejected with 400 and change nothing.

#### Scenario: Set caption and keywords
- **WHEN** a client sends `PATCH /api/photos/7` with `{"caption": "Sunrise", "keywords": ["dawn", "", "dawn", "hills"]}`
- **THEN** the response shows caption `Sunrise` and keywords `dawn`, `hills`, and the sidecar entry matches

#### Scenario: Clear a caption
- **WHEN** a client sends `{"caption": ""}` for a photo with a caption
- **THEN** the photo has no caption and its entry has no `caption` key

#### Scenario: Invalid body
- **WHEN** a client sends `{"isHidden": "yes"}`
- **THEN** the server responds 400 and nothing changes

#### Scenario: Star shortcut
- **WHEN** a client sends `PATCH /api/photos/7/star` with `{"isStarred": true}`
- **THEN** the photo is starred exactly as with `PATCH /api/photos/7` and `{"isStarred": true}`

#### Scenario: Caption and location together
- **WHEN** a client sends `{"caption": "Market", "location": {"lat": 49.8397, "lon": 24.0297}}`
- **THEN** both are saved in one sidecar write and the response shows both
