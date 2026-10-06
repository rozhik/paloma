# sidecar-files Specification

## Purpose

Defines the per-folder `.paloma.json` file in which Paloma stores what the user decides about the photos in that folder, and how it imports those decisions from Picasa's `.picasa.ini`, so the data travels with the folder and the library can be rebuilt from disk.

## Requirements

### Requirement: Folder sidecar format
A folder's sidecar SHALL be `.paloma.json` directly in that folder: a JSON object with `"format": "paloma-folder"`, `"version": 2`, an optional `iniHash` string, and a `photos` object keyed by exact file names in that folder. Paloma SHALL write it as UTF-8 without BOM, with 2-space indentation, LF line endings and `photos` keys sorted by name.

#### Scenario: Sidecar written for a starred photo
- **WHEN** the user stars `IMG_0042.jpg` in `/photos/trip`, which has neither `.paloma.json` nor a Picasa `.ini`
- **THEN** `/photos/trip/.paloma.json` contains `format` `"paloma-folder"`, `version` `2`, and in `photos` only `IMG_0042.jpg` with `"star": true` and a `modified` timestamp, formatted with 2-space indentation and LF line endings

#### Scenario: Stable key order
- **WHEN** the user stars `b.jpg` and then `a.jpg` in the same folder
- **THEN** the `photos` entry for `a.jpg` comes before the entry for `b.jpg` in the file

### Requirement: Photo fields are stored in the sidecar
A photo entry SHALL store `"star": true` for a starred photo, `"hidden": true` for a hidden photo, `caption` as a string, `keywords` as an array of strings, `albums` as a non-empty array of album tokens, `faces` as described in the people capability, `geotag` as described in the geotags capability and `edits` as a non-empty array of edit steps as described in the photo-edits capability. A field that is not set SHALL be absent; only `geotag` may also be `null`, and `caption` may be `""` and `keywords` may be `[]`, meaning the value embedded in the photo file was removed, as described in the photo-text capability. Paloma SHALL ignore a field of the wrong type for the library and SHALL keep it in the file until the user changes that field.

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

#### Scenario: Embedded caption removed
- **WHEN** `a.jpg` has an IPTC caption and its entry contains `"caption": ""`
- **THEN** `a.jpg` appears without a description

### Requirement: Entries changed in Paloma are marked
Whenever Paloma changes a photo's fields, it SHALL set that entry's `modified` to the current time in UTC (ISO 8601). Entries created only by importing a Picasa `.ini` SHALL NOT have `modified`.

#### Scenario: Change after import
- **WHEN** the entry for `a.jpg` was imported from `.picasa.ini` and the user then sets its caption
- **THEN** the entry has a `modified` timestamp

### Requirement: Empty entries are removed unless needed for import
When a change leaves an entry with no fields other than `modified`, Paloma SHALL remove the entry if the sidecar has no `iniHash`. If the sidecar has `iniHash`, it SHALL keep the entry with `modified`, so that the user's choice is not undone by a later re-import.

#### Scenario: Unstar without Picasa data
- **WHEN** the sidecar has no `iniHash`, the entry for `a.jpg` holds only `star` and `modified`, and the user removes the star
- **THEN** `.paloma.json` still exists and its `photos` object no longer contains `a.jpg`

#### Scenario: Unstar an imported star
- **WHEN** the star of `a.jpg` was imported from `.picasa.ini`, the sidecar has `iniHash`, and the user removes the star
- **THEN** the entry for `a.jpg` remains with only `modified`, and `a.jpg` stays unstarred after `.picasa.ini` is re-imported

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

### Requirement: Library fields come from the sidecar
When a photo is indexed, its star, hidden flag, caption, keywords, faces, geotag and edits in the library SHALL match its entry in a readable `.paloma.json` of its folder. A photo without an entry SHALL have none of these fields set, its location SHALL come from its EXIF, and its caption and keywords SHALL come from the text embedded in the file as described in the photo-text capability. If the folder has no `.paloma.json`, the fields SHALL come from the folder's Picasa `.ini` as described in "Picasa ini is shown live until the first change".

#### Scenario: Library rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"star": true` and `"caption": "Sunrise"`, and no photo has embedded text
- **THEN** `a.jpg` appears starred with caption `Sunrise`, and the other photos in the folder have no star, caption, keywords or hidden flag

#### Scenario: Geotag rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"geotag": { "lat": 50.45, "lon": 30.5234 }`
- **THEN** `a.jpg` has the location 50.45, 30.5234

#### Scenario: Edits rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a folder whose `.paloma.json` gives `a.jpg` `"edits": [{ "filter": "bw" }]`
- **THEN** `a.jpg` has that edit and its thumbnail is black & white

#### Scenario: Photo without an entry has embedded tags
- **WHEN** `b.jpg` has no entry in `.paloma.json` and has IPTC Keywords `old`
- **THEN** `b.jpg` has the keyword `old`

### Requirement: Picasa ini is read but never written
Paloma SHALL read a folder's Picasa file named `.picasa.ini` or `picasa.ini` in any letter case, preferring the name with the leading dot if both exist. It SHALL NOT create, modify or delete such a file. It SHALL decode it as UTF-8, falling back to windows-1251, SHALL NOT trim values, and SHALL use the first occurrence of a duplicate key.

#### Scenario: Older Picasa file name
- **WHEN** a folder contains `Picasa.ini` with a section `[a.jpg]` containing `star=yes`, and no `.paloma.json`
- **THEN** `a.jpg` appears starred in the library and `Picasa.ini` is unchanged

#### Scenario: Cyrillic in windows-1251
- **WHEN** `.picasa.ini` is not valid UTF-8 and contains `caption=` with a Cyrillic text in windows-1251
- **THEN** the photo's caption in the library shows that Cyrillic text

### Requirement: Supported Picasa fields are mapped
From a file section of the Picasa `.ini`, Paloma SHALL map: `star=yes` to star, `hidden=yes` to hidden, `caption` to caption, `keywords` (comma-separated, empty items dropped) to keywords, `albums` (comma-separated tokens, empty items and duplicates dropped) to albums, `faces` to faces as described in the people capability, `geotag` (`lat,lon` in decimal degrees, within range) to geotag, and `filters` to edits as described in "Picasa filters become edits". Every other key of a file section, a `geotag` that is not two numbers in range, and every section other than file sections, `[.album:*]` sections and `[Contacts2]`, SHALL be ignored. A section SHALL match a file in the folder ignoring letter case. The entry is keyed by the file's name on disk, or by the section name if no file matches.

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
- **WHEN** a section has `rotate=rotate(1)`, `redo=bw=1;` and `backuphash=52410`
- **THEN** none of them affect the library or appear in `.paloma.json`

#### Scenario: Faces
- **WHEN** `.picasa.ini` has `[a.jpg]` with `faces=rect64(579922efa1cce2aa),b8e4117cf1d6615b`
- **THEN** `a.jpg` has one face of the person `b8e4117cf1d6615b`

### Requirement: Picasa ini is shown live until the first change
While a folder has a Picasa `.ini` and no `.paloma.json`, the library SHALL show the supported fields read from the `.ini`. Paloma SHALL write nothing to the folder until the user changes a photo field there.

#### Scenario: Picasa folder opened in Paloma
- **WHEN** a folder with `.picasa.ini` marking `a.jpg` as starred and no `.paloma.json` is scanned
- **THEN** `a.jpg` appears starred and no file in the folder is created or changed

### Requirement: First change imports the Picasa ini
When the user changes a photo field in a folder that has a Picasa `.ini` and no `.paloma.json`, Paloma SHALL create `.paloma.json` with an entry, without `modified`, for every `.ini` file section that has supported fields, and SHALL set `iniHash` to the lowercase hex SHA-256 of the `.ini` bytes. It SHALL then apply the user's change on top.

#### Scenario: Star a photo in a Picasa folder
- **WHEN** `.picasa.ini` has `[a.jpg] caption=Sunrise` and `[b.jpg] star=yes`, and the user stars `c.jpg`
- **THEN** `.paloma.json` has `iniHash`, `a.jpg` with `"caption": "Sunrise"`, `b.jpg` with `"star": true`, and `c.jpg` with `"star": true` and `modified`

#### Scenario: Section for a missing file
- **WHEN** `.picasa.ini` has `[gone.jpg] star=yes` and no such file exists, and the user stars another photo
- **THEN** `.paloma.json` contains an entry for `gone.jpg` with `"star": true`

### Requirement: Changed Picasa ini is re-imported for unmodified entries
When a readable `.paloma.json` has `iniHash` and the folder's Picasa `.ini` exists with a different SHA-256, Paloma SHALL replace the supported fields of every entry without `modified` with the `.ini` values, adding and removing fields and entries as needed. It SHALL keep entries with `modified` unchanged, log a conflict naming the file if their `.ini` values differ, and update `iniHash`.

#### Scenario: Picasa user stars another photo
- **WHEN** after import the user stars `d.jpg` in Picasa, which rewrites `.picasa.ini`
- **THEN** `.paloma.json` gets `"star": true` for `d.jpg`, a new `iniHash`, and `d.jpg` appears starred without a restart

#### Scenario: Picasa removes a caption Paloma never touched
- **WHEN** the imported entry for `a.jpg` has no `modified` and its caption is removed in `.picasa.ini`
- **THEN** after re-import the entry for `a.jpg` has no caption

#### Scenario: Conflict with a Paloma change
- **WHEN** the user changed the caption of `a.jpg` in Paloma and later the caption of `a.jpg` is changed in `.picasa.ini`
- **THEN** the Paloma caption is kept, a conflict naming `a.jpg` is logged, and `iniHash` is updated

#### Scenario: Picasa ini deleted after import
- **WHEN** `.picasa.ini` is deleted from a folder that has `.paloma.json` with `iniHash`
- **THEN** `.paloma.json` and the library are unchanged

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

### Requirement: Photo change fails if the sidecar cannot be written
A change to a photo's fields SHALL take effect in the library only after it is saved to `.paloma.json`. If the sidecar is unreadable or cannot be written, the library SHALL stay unchanged, the API SHALL respond with an error, and an error naming the folder SHALL be logged.

#### Scenario: Change in a folder with a corrupt sidecar
- **WHEN** a folder's `.paloma.json` is not valid JSON and the user stars a photo in it
- **THEN** the request fails, the photo stays unstarred in the library, and the file is unchanged

#### Scenario: Read-only folder
- **WHEN** the user sets a caption for a photo in a folder where the server cannot write files
- **THEN** the request fails and the photo's caption in the library is unchanged

### Requirement: Sidecar writes are atomic
Paloma SHALL replace `.paloma.json` atomically, so any reader sees either the complete previous content or the complete new content, and an interrupted write never leaves a partial file in place of the sidecar.

#### Scenario: Concurrent reader
- **WHEN** another program reads `.paloma.json` while Paloma is saving a change
- **THEN** it reads valid JSON, either the old version or the new one

### Requirement: Outside changes are applied
While the server runs, when `.paloma.json` or the Picasa `.ini` of a watched folder is created, changed or deleted by something other than Paloma, the library SHALL update that folder's photo fields to match, and SHALL re-import a changed `.ini` as required above, without a restart.

#### Scenario: Sidecar edited in a text editor
- **WHEN** the user adds `"star": true` to the entry for `a.jpg` in `.paloma.json` with a text editor while the server runs
- **THEN** `a.jpg` appears starred in the library without a restart

#### Scenario: Sidecar deleted
- **WHEN** `.paloma.json` is deleted while the server runs and the folder has no Picasa `.ini`
- **THEN** all photos in that folder have no fields set, and Paloma does not recreate the file

#### Scenario: Picasa ini changed before any Paloma change
- **WHEN** a folder has no `.paloma.json` and `.picasa.ini` is changed to star `a.jpg`
- **THEN** `a.jpg` appears starred and no `.paloma.json` is created

### Requirement: Sidecar entries outlive their photos
Paloma SHALL NOT remove or change a `photos` entry because its file is missing, deleted or not indexed. Such an entry SHALL apply again when a file with that name appears in the folder.

#### Scenario: Photo removed and restored
- **WHEN** starred `a.jpg` is moved out of its folder and later moved back
- **THEN** `.paloma.json` keeps `"star": true` for `a.jpg` the whole time, and `a.jpg` appears starred again after it is moved back

### Requirement: Photo fields can be changed through the API
`PATCH /api/photos/:id` SHALL accept any of `isStarred` (boolean), `isHidden` (boolean), `caption` (string), `keywords` (array of strings) and `location` (as described in the geotags capability), and SHALL respond with the updated photo. An empty caption or keyword list SHALL clear the field as described in the photo-text capability. Keywords SHALL drop empty strings and duplicates ignoring letter case, keeping the first spelling and order. An empty body or a wrong type SHALL be rejected with 400 and change nothing.

#### Scenario: Set caption and keywords
- **WHEN** a client sends `PATCH /api/photos/7` with `{"caption": "Sunrise", "keywords": ["dawn", "", "dawn", "hills"]}`
- **THEN** the response shows caption `Sunrise` and keywords `dawn`, `hills`, and the sidecar entry matches

#### Scenario: Clear a caption
- **WHEN** a client sends `{"caption": ""}` for a photo with a caption and no embedded description
- **THEN** the photo has no caption and its entry has no `caption` key

#### Scenario: Clear an embedded caption
- **WHEN** a client sends `{"caption": ""}` for a photo whose file has an embedded description
- **THEN** the photo has no caption and its entry has `"caption": ""`

#### Scenario: Invalid body
- **WHEN** a client sends `{"isHidden": "yes"}`
- **THEN** the server responds 400 and nothing changes

#### Scenario: Star shortcut
- **WHEN** a client sends `PATCH /api/photos/7/star` with `{"isStarred": true}`
- **THEN** the photo is starred exactly as with `PATCH /api/photos/7` and `{"isStarred": true}`

#### Scenario: Caption and location together
- **WHEN** a client sends `{"caption": "Market", "location": {"lat": 49.8397, "lon": 24.0297}}`
- **THEN** both are saved in one sidecar write and the response shows both

### Requirement: Hidden photos are left out of photo lists
`GET /api/photos` SHALL return `caption`, `keywords` and `isHidden` for each photo, and SHALL exclude hidden photos unless the request has `includeHidden=true`. Folder photo counts SHALL not include hidden photos.

#### Scenario: Hidden photo in a folder
- **WHEN** a folder has three photos and one of them is hidden
- **THEN** the folder's photo list returns two photos, its count is two, and with `includeHidden=true` the list returns three

### Requirement: Picasa filters become edits
Paloma SHALL turn a section's `filters=` (`name=1,param,…;` items, in order) into an edit chain with one step per item, keeping their order and repeats, with `"enabled": false` for an item whose first parameter is `0`. `crop64` SHALL become a `crop64` step whose `rect` is the `rect64` hex (zero-padded to 16 digits) split into four 16-bit words divided by 65535. `bw` and `sepia` SHALL become steps of those filters. Other items SHALL keep their name as `filter` and their parameters: as named fields for `tilt` (`angle`, `scale`), `fill`, `unsharp2`, `sat`, `Boost` (`amount`), `finetune2` (`fillLight`, `highlights`, `shadows`, `neutral`, `temperature`) and `Vignette` (`radius`, `strength`, `fade`, `color`), and as `params`, a list of the raw strings, for any other. Items that cannot be read SHALL be dropped.

#### Scenario: Crop and effects
- **WHEN** `.picasa.ini` has `[a.jpg]` with `filters=crop64=1,33101d68ffffffff;autolight=1;bw=1;`
- **THEN** `a.jpg` has the edits `[{"filter": "crop64", "rect": {"left": 0.199466, "top": 0.11487, "right": 1, "bottom": 1}}, {"filter": "autolight"}, {"filter": "bw"}]`, shown cropped and in black & white

#### Scenario: Short rect64 and unknown filter
- **WHEN** a section has `filters=crop64=1,6911ae3ce91ecbd;PicnikGrain=1,0.350000,0;`
- **THEN** the `crop64` rect is read from `06911ae3ce91ecbd`, and the second step is `{"filter": "PicnikGrain", "params": ["0.350000", "0"]}`

#### Scenario: Picasa edits are undoable
- **WHEN** a Picasa folder's `a.jpg` has `filters=crop64=1,33101d68ffffffff;sepia=1;` and the user undoes in the viewer
- **THEN** `.paloma.json` is created with the import, and the entry for `a.jpg` has the edits with only the `crop64` step and `modified`
