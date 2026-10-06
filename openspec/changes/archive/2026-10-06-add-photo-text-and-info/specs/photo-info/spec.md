# Spec Delta

## Purpose

Defines the Info panel of the photo viewer, which shows everything Paloma knows about the current photo and lets the user edit its description and tags, and the API that serves this information.

## ADDED Requirements

### Requirement: Info button opens the panel
The viewer's navigation bar SHALL have an Info button that opens and closes the Info panel for the photo shown, and shows whether the panel is open. The `i` key SHALL do the same. The panel SHALL start closed each time the viewer opens.

#### Scenario: Open the panel
- **WHEN** the user opens a photo and chooses Info
- **THEN** the Info panel for that photo is shown and the Info button appears pressed

#### Scenario: Close with Esc
- **WHEN** the Info panel is open and the user presses Esc
- **THEN** the panel closes and the viewer stays open

### Requirement: Panel is drawn over the photo
The Info panel SHALL be drawn on top of the photo along the right screen edge, inside any overlay bar on that edge, and SHALL NOT shrink the area the photo is shown in. Its content SHALL scroll when it is taller than the window. In a right-to-left UI language its text SHALL be right-to-left, while it stays on the right edge.

#### Scenario: Bars and panel
- **WHEN** the navigation bar is at the top, the edit bar on the left, and the user opens the Info panel
- **THEN** the panel is along the right edge below the navigation bar, and the photo keeps its fitted size

### Requirement: Panel follows the shown photo
While the Info panel is open, moving to the previous or next photo SHALL keep it open and show the information of the new photo.

#### Scenario: Next photo
- **WHEN** the Info panel is open on `a.jpg` and the user presses `→`
- **THEN** the panel shows the information of the next photo

### Requirement: File section
The panel SHALL show the file name, the full path on disk, the file size in the active language's number format with a unit (B, KB, MB, GB, base 1024), the pixel dimensions, the date taken, and the file's last modification time.

#### Scenario: File facts
- **WHEN** the user opens Info for `/photos/trip/IMG_0042.JPG`, 3 524 812 bytes, 4000×3000
- **THEN** the panel shows `IMG_0042.JPG`, `/photos/trip/IMG_0042.JPG`, `3.4 MB` (formatted for the active language) and `4000 × 3000`

### Requirement: Description is edited in the panel
The panel SHALL show the description in a text field. Enter or leaving the field SHALL save a changed description; Esc in the field SHALL restore the saved value without closing the panel. Saving SHALL follow the description rules of the photo-text capability. A failed save SHALL show its error and restore the saved value.

#### Scenario: Write a description
- **WHEN** the user types `Old bridge` into the description of `a.jpg` and presses Enter
- **THEN** `a.jpg` has the description `Old bridge` and its sidecar entry has `"caption": "Old bridge"`

#### Scenario: Esc in the field
- **WHEN** the user changes the description text and presses Esc
- **THEN** the field shows the saved description again and the panel stays open

#### Scenario: Save fails
- **WHEN** the folder's `.paloma.json` is not valid JSON and the user saves a description
- **THEN** the panel shows an error and the field shows the previous description

### Requirement: Tags are edited in the panel
The panel SHALL show the photo's tags as chips, each with a remove button whose accessible name names the tag in the active language, followed by a field to add a tag, with suggestions from the tag list. Enter or a comma SHALL add the typed tag as a chip; the remove button, or Backspace in the empty field for the last chip, SHALL remove that tag. Each change SHALL be saved at once and follow the tag rules of the photo-text capability. A failed save SHALL show its error and restore the shown chips.

#### Scenario: Add a tag
- **WHEN** the user types `river` in the tag field and presses Enter
- **THEN** `river` is shown as a chip of the photo and the sidebar's Tags list includes `river`

#### Scenario: Remove a tag with the chip's button
- **WHEN** the user chooses the remove button of the chip `old`
- **THEN** the chip disappears and the photo no longer has `old`

#### Scenario: Backspace removes the last chip
- **WHEN** the photo has the tags `old` and `river`, the tag field is empty and the user presses Backspace in it
- **THEN** the chip `river` disappears and the photo has only `old`

### Requirement: Albums section
The panel SHALL list the shown names of the albums the photo is in, with untitled albums shown as untitled, or say that the photo is in no album.

#### Scenario: Two albums
- **WHEN** the photo is in `Birds` and `Trip`
- **THEN** the Albums section lists `Birds` and `Trip`

### Requirement: People section
The panel SHALL list the people on the photo as described in the people capability, or say that no people are named on it.

#### Scenario: Person from Picasa
- **WHEN** Picasa faces name `Roy Avery` on the photo
- **THEN** the People section lists `Roy Avery`

### Requirement: Location section
The panel SHALL show the photo's latitude and longitude with 6 decimals, whether the location comes from the camera or was set by the user, and the place name in the active language when geocoding is on and the name is known. A photo without a location SHALL be shown as having no location.

#### Scenario: Camera location
- **WHEN** the photo has the EXIF location 48.160833, 24.500278 and the place `Yaremche` is known
- **THEN** the Location section shows `48.160833, 24.500278`, that it comes from the camera, and `Yaremche`

#### Scenario: No location
- **WHEN** the photo has no location
- **THEN** the Location section says the photo has no location

### Requirement: EXIF section
The panel SHALL have an EXIF section listing every EXIF field read from the photo file, grouped as in the file (image, photo, GPS, interoperability), with the field's name and its value as text. Binary fields, such as the maker note and the thumbnail, SHALL be shown only with their size. A photo without EXIF SHALL be shown as having no EXIF data.

#### Scenario: Camera data
- **WHEN** a professional user opens Info for a photo with EXIF `Model` `Canon EOS 80D` and `FNumber` 5.6
- **THEN** the EXIF section lists `Model` `Canon EOS 80D` and `FNumber` `5.6`

#### Scenario: Maker note
- **WHEN** the photo's EXIF has a 4 000-byte maker note
- **THEN** the EXIF section shows `MakerNote` with its size and not its bytes

### Requirement: JSON section
The panel SHALL have a JSON section showing the photo's entry in its folder's `.paloma.json`, exactly as stored and formatted with 2-space indentation. When the folder has no `.paloma.json`, it SHALL show the fields read from the Picasa `.ini` and say they are not yet saved to `.paloma.json`. Without an entry it SHALL say the photo has no entry. When the sidecar is unreadable it SHALL say so.

#### Scenario: Entry with unknown keys
- **WHEN** the entry for `a.jpg` is `{"star": true, "rotate": 90, "modified": "2026-10-01T10:00:00.000Z"}`
- **THEN** the JSON section shows that object, including `"rotate": 90`

#### Scenario: Picasa folder
- **WHEN** the folder has `.picasa.ini` giving `a.jpg` `star=yes` and no `.paloma.json`
- **THEN** the JSON section shows `{"star": true}` and says it is not yet saved to `.paloma.json`

### Requirement: Other facts
The panel SHALL show whether the photo is starred and whether it is hidden, and how many edit steps it has.

#### Scenario: Edited photo
- **WHEN** the photo is starred and has a crop and a sepia step
- **THEN** the panel shows that it is starred, not hidden, and has 2 edits

### Requirement: Photo info API
`GET /api/photos/:id/info` SHALL respond with the photo as in photo lists, the file's path, size and modification time, the names of its albums, its people, its place name in the language given by `lang`, its EXIF fields, and its sidecar entry with where it comes from (`paloma`, `ini` or none) or that the sidecar is unreadable. An unknown id SHALL respond 404.

#### Scenario: Unknown photo
- **WHEN** a client sends `GET /api/photos/99999/info` and no such photo exists
- **THEN** the server responds 404

#### Scenario: Info reads the file without changing it
- **WHEN** a client sends `GET /api/photos/7/info`
- **THEN** the response contains the EXIF fields of photo 7, and no file in its folder is created or changed
