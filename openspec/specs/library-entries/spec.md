# library-entries Specification

## Purpose

Defines how a library entry (a shortcut, memory, album, tag, person or folder) can be acted on and inspected from wherever it is named: its menu in the sidebar, its Information dialog with statistics, the statistics API, and links that open it.

## Requirements

### Requirement: Entry menu button
In every skin, each sidebar entry for a shortcut, memory, album, tag, person or folder SHALL have a menu button next to its photo count. The Unrecognized entry SHALL NOT have one. The button's tooltip and accessible name SHALL name the entry in the active language. Opening the menu SHALL NOT change the selected entry or the grid. Esc or a click outside SHALL close the menu.

#### Scenario: Menu of another album
- **WHEN** folder `2024` is open and the user opens the menu button of album `Trip` in the sidebar
- **THEN** the menu of `Trip` opens and the grid still shows folder `2024`

#### Scenario: Accessible name
- **WHEN** the UI is in English and a screen reader reaches the menu button of album `Trip`
- **THEN** it announces a name that includes `Trip`

#### Scenario: No menu for Unrecognized
- **WHEN** the People list shows the Unrecognized entry
- **THEN** that entry has no menu button

### Requirement: Entry menu offers the header actions
The entry menu SHALL offer the actions that the entry's grid header offers, on all of the entry's photos: Slideshow; Find faces; the AI menu's tasks and Run again; and, for an album, Edit properties and Delete. Each SHALL do the same as the header button and follow the same level as it. Delete SHALL ask for confirmation as in the album header. The grid headers SHALL stay unchanged.

#### Scenario: Slideshow of an entry that is not open
- **WHEN** folder `2024` is open and the user chooses Slideshow in the menu of album `Trip`
- **THEN** the slideshow plays the photos of `Trip`, and after it ends the grid still shows folder `2024`

#### Scenario: Delete an album from the menu
- **WHEN** the level is Normal and the user chooses Delete in the menu of album `Trip` and confirms
- **THEN** the album is deleted as with the album header's Delete button

#### Scenario: Easy has no album management in the menu
- **WHEN** the level is Easy and the user opens the menu of album `Trip`
- **THEN** the menu does not offer Edit properties, Delete, Find faces or AI tasks

#### Scenario: AI task from the entry menu
- **WHEN** folder `2024` is open and the user chooses AI → Tags in the menu of album `Trip`
- **THEN** the Tags task runs on all photos of `Trip`, and the grid still shows folder `2024`

### Requirement: Map item shows the entry's photos
The entry menu SHALL offer Map at the levels that offer the map view. Choosing it SHALL open the entry as choosing it in the sidebar does, then open the map view, which SHALL then show that entry's geotagged photos.

#### Scenario: Map of an album
- **WHEN** album `Trip` has five photos, three of them geotagged, and the user chooses Map in its menu
- **THEN** the map view opens and shows exactly those three photos

#### Scenario: Map hidden at Easy
- **WHEN** the level is Easy
- **THEN** no entry menu offers Map

### Requirement: Information dialog
The entry menu SHALL offer Information from the Easy level up. Choosing it SHALL open a dialog titled with the entry's icon and name. The dialog SHALL show, for the entry's photos that are not hidden: their number, total file size (base 1024, as in the photo Info panel), the earliest and latest date taken, how many have no date taken, and how many are starred, geotagged and modified. All numbers and dates SHALL follow the active language.

#### Scenario: Statistics of an album
- **WHEN** album `Trip` has 3 photos of 1 MB, 2 MB and 3 MB taken from 2024-05-01 to 2024-05-09, one of them starred and two with saved edits, and the user opens its Information
- **THEN** the dialog shows 3 photos, `6 MB`, the dates 2024-05-01 and 2024-05-09 in the active language's date format, 1 starred and 2 modified

#### Scenario: Hidden photos are not counted
- **WHEN** folder `2024` has 10 photos, 2 of them hidden, and the user opens its Information
- **THEN** the dialog shows 8 photos

#### Scenario: Not at Child
- **WHEN** the level is Child
- **THEN** the entry menu does not offer Information

### Requirement: Information lists related entries
The Information dialog SHALL list the folders, albums and people that the entry's photos belong to, each with its number of the entry's photos, most photos first, then by name. Each SHALL be shown as an entry link. A list with nothing in it SHALL be left out, as SHALL the list of the entry's own kind when it would contain only the entry itself.

#### Scenario: Folders of a tag
- **WHEN** tag `river` is on 4 photos in folder `2023` and 1 in folder `2024`, and the user opens its Information
- **THEN** the dialog lists `2023` with 4 and then `2024` with 1, each as a link

#### Scenario: Folder's own list is left out
- **WHEN** the user opens the Information of folder `2024`
- **THEN** the dialog has no list of folders

### Requirement: Photo statistics API
`GET /api/photos/stats` SHALL accept the same selection parameters as `GET /api/photos` and return totals over every matching photo, not a page of them: `photoCount`, `totalSize` in bytes, `takenFrom` and `takenTo` (or null), `undatedCount`, `starredCount`, `geotaggedCount`, `modifiedCount`, and `folders`, `albums` and `people` lists with ids, shown names and `photoCount`. An invalid date filter SHALL be rejected with 400 `invalid_date`.

#### Scenario: More photos than a page
- **WHEN** folder `2024` has 1 200 photos that are not hidden and a client requests `GET /api/photos/stats?folderId=<id of 2024>`
- **THEN** the response has `photoCount` 1200 and `totalSize` equal to the sum of their file sizes

#### Scenario: Modified means a saved edit chain
- **WHEN** of three matching photos one has an edit chain with a crop step and another has no edits
- **THEN** `modifiedCount` counts only the photo with the crop

#### Scenario: Empty selection
- **WHEN** no photo matches the parameters
- **THEN** the response has `photoCount` 0, `totalSize` 0, `takenFrom` and `takenTo` null and empty lists

#### Scenario: Invalid date
- **WHEN** a client requests `GET /api/photos/stats?takenFrom=2024-13-01`
- **THEN** the server responds 400 with code `invalid_date`

### Requirement: Statistics are read-only
Computing statistics SHALL NOT create, change or delete any file in the photo folders.

#### Scenario: Stats of a Picasa folder
- **WHEN** a folder has a `.picasa.ini` and no `.paloma.json`, and the user opens its Information
- **THEN** the folder still has no `.paloma.json`, and its `.picasa.ini` is unchanged

### Requirement: Entry links
Wherever the UI names a folder, album, tag or person as an entry link, it SHALL show the entry's sidebar icon and its shown name, and SHALL be reachable with the keyboard. Choosing it SHALL close any dialog or viewer it is shown in and open that entry in the library, as choosing it in the sidebar does.

#### Scenario: Open an album from Information
- **WHEN** the Information of tag `river` lists album `Trip` and the user chooses it
- **THEN** the dialog closes and the library shows album `Trip`

#### Scenario: Keyboard
- **WHEN** an entry link has keyboard focus and the user presses Enter
- **THEN** that entry is opened in the library

### Requirement: Entry links follow the level
An entry link SHALL be shown as a link only when the active level offers the entry's sidebar list and, for a person, choosing a person. Otherwise it SHALL show the same icon and name as plain text that does nothing when chosen.

#### Scenario: List not offered
- **WHEN** the active level does not offer the sidebar's Folders list and a folder is named as an entry link
- **THEN** the folder's icon and name are shown, and choosing them does nothing
