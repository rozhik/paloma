# albums Specification

## Purpose

Defines global photo albums the way Picasa stores them: a definition copied into the `.paloma.json` of each folder that has a photo in the album, plus per-photo membership. Also covers how albums are imported from `.picasa.ini`, listed in the library, and managed through the API and UI.

## Requirements

### Requirement: Album definitions are stored in folder sidecars
A sidecar's top-level `albums` object SHALL map an album token to its definition: an object with optional `name`, `date`, `location` and `description` strings, an optional `cover` file name and an optional `modified` timestamp. Albums created by Paloma SHALL get a new random token of 32 lowercase hex characters. Paloma SHALL write a definition into every folder where it adds a photo to that album.

#### Scenario: Album created from photos in two folders
- **WHEN** the user creates an album `Birds` from `/photos/a/1.jpg` and `/photos/b/2.jpg`
- **THEN** both `/photos/a/.paloma.json` and `/photos/b/.paloma.json` contain under `albums` the same new token with `"name": "Birds"`, a `date` and a `modified` timestamp

#### Scenario: Name with spaces
- **WHEN** an album definition has `"name": " Birds  of Ukraine"`
- **THEN** the library shows the name with the same spaces

### Requirement: Album membership is stored in photo entries
A photo entry's `albums` field SHALL be a non-empty array of album tokens without duplicates. A photo without albums SHALL have no `albums` field. Changing a photo's albums SHALL follow the same `modified` and empty-entry rules as the other photo fields.

#### Scenario: Photo added to an album
- **WHEN** the user adds `a.jpg` to the album with token `c9ea9fa67022f38a3c771894d2a8a468`
- **THEN** the entry for `a.jpg` contains `"albums": ["c9ea9fa67022f38a3c771894d2a8a468"]` and a `modified` timestamp

#### Scenario: Last album removed from a photo
- **WHEN** the sidecar has no `iniHash`, `a.jpg`'s entry holds only `albums` with one token and `modified`, and the user removes `a.jpg` from that album
- **THEN** the `photos` object no longer contains `a.jpg`

### Requirement: Picasa album sections are read
From a Picasa `.ini`, Paloma SHALL read each `[.album:<token>]` section as the definition of the album `<token>`, mapping its `name`, `date`, `location` and `description` keys without trimming and ignoring other keys. It SHALL read a file section's `albums` key as a comma-separated list of tokens, dropping empty items and duplicates.

#### Scenario: Album section and membership
- **WHEN** `.picasa.ini` has `[.album:c9ea]` with `name= Birds`, `token=c9ea` and `date=2018-10-23T15:33:29+03:00`, and `[a.jpg]` with `albums=c9ea,,c9ea`
- **THEN** the library has an album `c9ea` named ` Birds` with date `2018-10-23T15:33:29+03:00`, and `a.jpg` is in it once

#### Scenario: Album section without a name
- **WHEN** a folder's `.ini` has `[.album:c9ea]` with only `token=c9ea`, and another folder's `.ini` names `c9ea` `Birds`
- **THEN** the album is shown as `Birds`

### Requirement: Albums from a Picasa ini are shown live until the first change
While a folder has a Picasa `.ini` and no `.paloma.json`, the library SHALL show the album definitions and memberships read from the `.ini` without writing to the folder.

#### Scenario: Picasa folder with albums opened in Paloma
- **WHEN** a folder with `.picasa.ini` putting `a.jpg` into album `Birds` and no `.paloma.json` is scanned
- **THEN** the album `Birds` lists `a.jpg` and no file in the folder is created or changed

#### Scenario: Album shared by a Paloma folder and a Picasa-only folder
- **WHEN** `/photos/a/.paloma.json` puts `1.jpg` into album `c9ea`, and `/photos/b` has no `.paloma.json` and its `.picasa.ini` puts `2.jpg` into `c9ea`
- **THEN** the album `c9ea` lists both `1.jpg` and `2.jpg`

### Requirement: First change imports album data
When the first user change in a folder imports its Picasa `.ini` into a new `.paloma.json`, Paloma SHALL also import every `[.album:*]` section as a definition without `modified` (a section with no mapped keys becomes `{}`), and every file section's `albums` into its entry.

#### Scenario: Star a photo in a Picasa folder with albums
- **WHEN** `.picasa.ini` defines album `c9ea` named `Birds` and has `[a.jpg] albums=c9ea`, and the user stars `b.jpg`
- **THEN** `.paloma.json` contains `albums.c9ea` with `"name": "Birds"` and no `modified`, `a.jpg` with `"albums": ["c9ea"]`, and `b.jpg` with `"star": true`

### Requirement: Changed Picasa ini re-imports album definitions
When a changed Picasa `.ini` is re-imported, Paloma SHALL replace the mapped keys of every album definition without `modified` with the `.ini` values for that token, add definitions for new `[.album:*]` sections, keep definitions with `modified` unchanged, and SHALL NOT remove any album definition. Memberships SHALL be re-imported as a photo field.

#### Scenario: Album renamed in Picasa
- **WHEN** after import an album untouched in Paloma is renamed in Picasa, which rewrites `.picasa.ini`
- **THEN** the definition in `.paloma.json` gets the new name and the library shows it without a restart

#### Scenario: Album renamed in both
- **WHEN** an album was renamed in Paloma and later renamed in Picasa
- **THEN** the Paloma name is kept

#### Scenario: Album section removed from the ini
- **WHEN** a re-imported `.ini` no longer has a `[.album:c9ea]` section that was imported before
- **THEN** `.paloma.json` still contains the definition of `c9ea`

### Requirement: Album name is resolved across folders
The library SHALL show an album's `name`, `date`, `description` and `location` from one folder copy. That copy is the one with the newest `modified`. If no copy has `modified`, it is the first copy in folder path order that has a non-empty `name`. If no copy has a name, the album SHALL be shown as untitled and the API SHALL return `name` as `null`.

#### Scenario: Paloma rename beats a stale copy
- **WHEN** `/photos/a/.paloma.json` defines `c9ea` as `Old` without `modified`, and `/photos/b/.paloma.json` defines it as `New` with `modified`
- **THEN** the album is shown as `New`

#### Scenario: Picasa copies only
- **WHEN** neither copy has `modified`, `/photos/a` has no name for `c9ea` and `/photos/b` names it `Birds`
- **THEN** the album is shown as `Birds`

### Requirement: Library lists albums that have photos
`GET /api/albums` SHALL return every album that has at least one photo in the library, with its `token`, `name`, `date`, `description`, `location`, the number of its photos that are not hidden, its cover photo id and the cover thumbnail. Albums SHALL be sorted by name, ignoring case, with untitled albums last. A definition without any member photo in the library SHALL NOT be listed.

#### Scenario: Album across two folders
- **WHEN** album `Birds` has two photos in `/photos/a` and one in `/photos/b`, and one of them is hidden
- **THEN** `GET /api/albums` returns `Birds` with a photo count of 2

#### Scenario: Definition without photos
- **WHEN** a sidecar defines album `c9ea` but no photo in the library lists `c9ea`
- **THEN** `GET /api/albums` does not return `c9ea`

### Requirement: Album photos can be listed
`GET /api/photos?album=<token>` SHALL return the photos in that album from every folder, with the same ordering and hidden-photo rules as other photo lists. Every photo returned by the API SHALL include `albums`, the tokens of its albums.

#### Scenario: Photos of an album
- **WHEN** a client sends `GET /api/photos?album=c9ea` and album `c9ea` has photos in two folders
- **THEN** the response contains exactly those photos, each with `c9ea` in its `albums`

### Requirement: Album membership follows the folder files
The library's albums and memberships SHALL always match the folder sidecars, or the live Picasa `.ini` where there is no sidecar. This SHALL hold after a rescan, after a rebuild of the library database, and after outside changes to `.paloma.json` or the `.ini` while the server runs. An unreadable sidecar SHALL contribute no albums or memberships.

#### Scenario: Library rebuilt from disk
- **WHEN** the library database is deleted and the server starts with folders whose sidecars define album `Birds` with three member photos
- **THEN** the album `Birds` lists the same three photos

#### Scenario: Membership edited in a text editor
- **WHEN** the user adds an album token to `a.jpg`'s `albums` in `.paloma.json` with a text editor while the server runs
- **THEN** `a.jpg` appears in that album without a restart

### Requirement: Create an album from photos
`POST /api/albums` with a `name`, a non-empty `photoIds` list and optional `description` and `location` strings SHALL create an album with those fields, the current date and time (ISO 8601 with the local offset) as `date`, and the given photos. It SHALL respond with the album. A `name` that is empty or only spaces, or a missing or empty `photoIds`, SHALL be rejected with 400. An unknown photo id SHALL be rejected with 404. In both cases nothing changes.

#### Scenario: New album from selected photos
- **WHEN** a client sends `POST /api/albums` with `{"name": "Trip", "photoIds": [3, 7]}`
- **THEN** the response contains a new token and the name `Trip`, and `GET /api/photos?album=<token>` returns photos 3 and 7

#### Scenario: Album without photos
- **WHEN** a client sends `{"name": "Empty", "photoIds": []}`
- **THEN** the server responds 400 and no album is created

### Requirement: Add and remove album photos
`POST /api/albums/:token/photos` SHALL add the photos in `photoIds` to an album the library lists, copying its shown definition into each folder that has none. `DELETE /api/albums/:token/photos` SHALL remove them from it. Photos already in the album, or not in it, SHALL be left as they are. An unknown token or photo id SHALL be rejected with 404.

#### Scenario: Add a photo from a new folder
- **WHEN** album `Birds` has photos only in `/photos/a`, and the user adds `/photos/c/x.jpg`
- **THEN** `/photos/c/.paloma.json` defines the album with the name `Birds`, `x.jpg` lists its token, and the album shows the new photo

#### Scenario: Remove the last photo
- **WHEN** the user removes the only photo of an album from it
- **THEN** the album no longer appears in `GET /api/albums`, and the photo file is unchanged

### Requirement: Edit album properties
`PATCH /api/albums/:token` SHALL accept any of `name`, `description` and `location` (strings) and `coverPhotoId`, and SHALL respond with the album. It SHALL write the album's shown definition with the changes and a new `modified` into every library folder that defines the album or has a photo in it. An empty `description` or `location` SHALL remove that field. An empty or only-spaces `name`, an empty body or a wrong type SHALL be rejected with 400 and change nothing.

#### Scenario: Rename an album spread over folders
- **WHEN** album `Birds` is defined in `/photos/a` and `/photos/b`, and the user renames it to `Birds of Ukraine`
- **THEN** both sidecars contain the new name with `modified`, and the album is shown as `Birds of Ukraine`

#### Scenario: Set description and location
- **WHEN** a client sends `PATCH /api/albums/c9ea` with `{"description": "Spring migration", "location": "Kyiv"}`
- **THEN** every copy of `c9ea` has that `description` and `location`, and `GET /api/albums` returns them

#### Scenario: Clear the location
- **WHEN** a client sends `{"location": ""}` for an album with a location
- **THEN** no copy of the album has a `location` key, and the album is returned without a location

#### Scenario: Edit an album known only from a Picasa ini
- **WHEN** an album is defined only in a folder's `.picasa.ini`, there is no `.paloma.json`, and the user renames it
- **THEN** `.paloma.json` is created with the imported `.ini` data and the new name, and `.picasa.ini` is unchanged

### Requirement: Choose an album cover
The album cover SHALL be the photo chosen by the user while it is a non-hidden photo of the album, and otherwise the first non-hidden photo of the album in photo-list order. `coverPhotoId` in `PATCH /api/albums/:token` SHALL choose the cover; `null` SHALL return to the default. The choice SHALL be stored as `cover` (the file name) only in the definition in the cover photo's folder. A photo that is not in the album SHALL be rejected with 400.

#### Scenario: Choose a cover
- **WHEN** the user makes `/photos/b/2.jpg` the cover of an album that has photos in `/photos/a` and `/photos/b`
- **THEN** `/photos/b/.paloma.json` has `"cover": "2.jpg"` in the album's definition, no copy in other folders has `cover`, and the album list shows `2.jpg` as the cover

#### Scenario: Cover survives a library rebuild
- **WHEN** the library database is deleted and the server restarts
- **THEN** the album still shows the chosen cover

#### Scenario: Cover photo leaves the album
- **WHEN** the cover photo is removed from the album
- **THEN** the album shows the default cover

#### Scenario: Cover outside the album
- **WHEN** a client sends `{"coverPhotoId": 99}` and photo 99 is not in the album
- **THEN** the server responds 400 and nothing changes

#### Scenario: Reset to the default cover
- **WHEN** a client sends `{"coverPhotoId": null}`
- **THEN** no copy of the album has `cover`, and the album shows the default cover

### Requirement: Delete an album
`DELETE /api/albums/:token` SHALL remove the album's token from every photo entry and remove its definition, in every library folder that defines the album or has a photo in it. No photo file SHALL be moved or deleted.

#### Scenario: Delete an album
- **WHEN** the user deletes album `Birds`, which has photos in two folders
- **THEN** neither sidecar has the `Birds` definition or its token in any entry, the album is not listed, and all photos are still in the library

#### Scenario: Deleted album stays deleted after Picasa re-import
- **WHEN** an album imported from `.picasa.ini` is deleted in Paloma and the `.ini` is later changed without adding photos to that album
- **THEN** the album is still not listed

### Requirement: Album changes across folders are saved folder by folder
An album change SHALL take effect in the library for a folder only after it is saved to that folder's `.paloma.json`. If any affected folder has an unreadable sidecar, the change SHALL be rejected with 409 and nothing written. If writing a folder fails, the folders already written SHALL keep the change, and the API SHALL respond with an error naming the folders that were not changed.

#### Scenario: One folder has a corrupt sidecar
- **WHEN** the user adds photos from `/photos/a` and `/photos/b` to an album and `/photos/b/.paloma.json` is not valid JSON
- **THEN** the request fails with 409, and neither sidecar nor the library changes

#### Scenario: One folder is read-only
- **WHEN** the user renames an album defined in `/photos/a` and in read-only `/photos/b`
- **THEN** `/photos/a` has the new name, the response is an error naming `/photos/b`, and the error is logged

### Requirement: Albums in the sidebar
The library screen SHALL show an "Albums" section in the sidebar that lists the albums from `GET /api/albums` with their photo counts. Selecting an album SHALL show its photos in the photo grid with the album's name, description and location above them.

#### Scenario: Open an album
- **WHEN** the user clicks the album `Birds` in the sidebar
- **THEN** the grid shows only the photos of `Birds`, and the header shows `Birds` and its photo count

#### Scenario: No albums
- **WHEN** the library has no albums
- **THEN** the Albums section says there are no albums yet

### Requirement: Manage albums from the UI
For selected photos, the UI SHALL offer "Add to album", which lets the user pick an existing album or enter a name for a new one. In an album view the UI SHALL offer editing the album's name, description and location, deleting the album, removing the selected photos from it, and, when exactly one photo is selected, making it the cover. Deleting SHALL ask for confirmation. A failed request SHALL show its error and leave the shown data unchanged.

#### Scenario: New album from the tray
- **WHEN** the user selects two photos, chooses "Add to album", enters `Trip` as a new album and confirms
- **THEN** `Trip` appears in the sidebar with 2 photos

#### Scenario: Remove photos in an album view
- **WHEN** the user opens album `Trip`, selects one photo and chooses "Remove from album"
- **THEN** the album view and the sidebar count show one photo less

#### Scenario: Edit album properties
- **WHEN** the user opens album `Trip`, edits its properties to add the description `Summer 2024` and the location `Lviv`, and saves
- **THEN** the album header shows the description and the location

#### Scenario: Make a photo the cover
- **WHEN** the user selects one photo in album `Trip` and chooses "Make cover"
- **THEN** the sidebar shows that photo as the cover of `Trip`

#### Scenario: Delete needs confirmation
- **WHEN** the user chooses to delete album `Trip` and then cancels the confirmation
- **THEN** the album is unchanged
