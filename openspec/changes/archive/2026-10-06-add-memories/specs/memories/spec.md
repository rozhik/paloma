# Spec Delta

## Purpose

Brings old photos back by building, for each day, virtual albums of the photos taken around the same date in earlier years, named and shown without the user organizing anything.

## ADDED Requirements

### Requirement: A memory is a past year around today's date
For a date D, each earlier year Y SHALL have a memory when at least 3 photos that are not hidden were taken within 3 days before or after D's month and day in Y. February 29 SHALL count as February 28 in a year without it. A photo's date taken SHALL be its calendar date as the library has it: the camera date from EXIF, otherwise the file's modification date. Years with fewer than 3 such photos, and D's own year, SHALL have no memory.

#### Scenario: Photos ten years ago
- **WHEN** today is 2026-10-06 and the library has 4 photos taken on 2016-10-04, 2016-10-06, 2016-10-09 and 2016-10-10
- **THEN** there is a memory for 2016 with the first 3 photos, and the photo of 2016-10-10 is not in it

#### Scenario: Too few photos
- **WHEN** today is 2026-10-06 and only 2 photos were taken between 2019-10-03 and 2019-10-09
- **THEN** there is no memory for 2019

#### Scenario: Hidden photos do not count
- **WHEN** 3 photos were taken on 2020-10-06 and one of them is hidden
- **THEN** there is no memory for 2020

#### Scenario: Window across New Year
- **WHEN** today is 2026-01-01 and 3 photos were taken on 2015-12-30, 2016-01-01 and 2016-01-03
- **THEN** the memory for 2016 has all 3 photos

#### Scenario: Leap day
- **WHEN** today is 2028-02-29 and 3 photos were taken on 2027-02-27
- **THEN** there is a memory for 2027 with those photos

#### Scenario: This year is not a memory
- **WHEN** today is 2026-10-06 and 5 photos were taken on 2026-10-04
- **THEN** there is no memory for 2026

### Requirement: Memories are virtual
Memories SHALL be computed from the library and SHALL NOT be stored in the photo folders, the sidecars or the photo files. Building, listing and opening memories SHALL NOT create or change any file. They SHALL NOT be listed among albums.

#### Scenario: Memories change no files
- **WHEN** the user opens every memory of the day
- **THEN** no `.paloma.json`, `.picasa.ini` or photo file is created or changed, and `GET /api/albums` is unchanged

### Requirement: Memories follow the library
The memories of a date SHALL be built from the library's current photos, dates, hidden marks and albums, so that newly scanned photos, hiding or unhiding a photo, and album changes show in the next listing without a restart.

#### Scenario: Photo hidden
- **WHEN** a memory has exactly 3 photos and the user hides one of them
- **THEN** the next listing of memories no longer has that memory

#### Scenario: New photos scanned
- **WHEN** a folder with 3 photos taken on 2012-10-07 is added and scanned, and today is 2026-10-06
- **THEN** the next listing has a memory for 2012

### Requirement: A memory is named after its album or its age
A memory whose photos are all in one album that has a name SHALL be named `<album name> in '<two-digit year>`, for example `Kyiv in '91`. If several such albums contain all its photos, the one with the fewest photos SHALL be used, and among equals the first by name ignoring case. Any other memory SHALL be named `<N> years ago`, where N is D's year minus the memory's year. Names SHALL be in the active UI language with its plural rules; the album name SHALL be shown as stored.

#### Scenario: All photos in one album
- **WHEN** a memory for 1991 has 5 photos and all of them are in the album `Kyiv`
- **THEN** the memory is named `Kyiv in '91`

#### Scenario: Photos from different albums
- **WHEN** a memory for 2016 has 3 photos in the album `Kyiv` and 2 photos in no album, and today is 2026-10-06
- **THEN** the memory is named `10 years ago`

#### Scenario: One year ago
- **WHEN** a memory is for the year before today's year
- **THEN** it is named `1 year ago`, with the singular form

#### Scenario: Ukrainian name
- **WHEN** the active language is Ukrainian and a memory is 10 years old with photos in several albums
- **THEN** its name is `10 років тому`

#### Scenario: Smallest album wins
- **WHEN** all photos of a memory are in both the album `Trips` with 200 photos and the album `Kyiv` with 12 photos
- **THEN** the memory is named after `Kyiv`

#### Scenario: Untitled album
- **WHEN** all photos of a memory are only in an album without a name
- **THEN** the memory is named `<N> years ago`

### Requirement: Memories are listed newest first
Memories SHALL be ordered by year, newest first. A memory's cover SHALL be its first starred photo in photo-list order, and without one its first photo in photo-list order.

#### Scenario: Order and cover
- **WHEN** there are memories for 2016, 2023 and 1991, and the 2023 memory has one starred photo
- **THEN** they are listed as 2023, 2016, 1991, and the 2023 memory shows the starred photo as its cover

### Requirement: Memories API
`GET /api/memories` with `date` (`YYYY-MM-DD`, the client's local date) SHALL respond with the memories of that date, each with its `year`, `yearsAgo`, the first and last day of its window as `from` and `to` (`YYYY-MM-DD`), its photo count, the naming album's `token` and shown name or `null`, and its cover photo id and cover thumbnail. A missing or invalid `date` SHALL be rejected with 400.

#### Scenario: List memories
- **WHEN** a client sends `GET /api/memories?date=2026-10-06` and the library has a memory for 2016
- **THEN** the response has an entry with `year` 2016, `yearsAgo` 10, `from` `2016-10-03` and `to` `2016-10-09`

#### Scenario: Invalid date
- **WHEN** a client sends `GET /api/memories?date=2026-13-40`
- **THEN** the server responds 400 with an error code

### Requirement: Photos taken in a date range
`GET /api/photos` SHALL accept `takenFrom` and `takenTo` (`YYYY-MM-DD`, inclusive) and SHALL return only photos whose date taken lies in that range, combined with the other filters and the usual ordering and hidden-photo rules. A value that is not a valid date SHALL be rejected with 400.

#### Scenario: Photos of a memory
- **WHEN** a client sends `GET /api/photos?takenFrom=2016-10-03&takenTo=2016-10-09`
- **THEN** the response contains exactly the photos not hidden that were taken from 2016-10-03 to 2016-10-09

### Requirement: Memories in the sidebar
The sidebar SHALL have a Memories section above Albums that lists today's memories with their name, cover thumbnail and photo count. When there are no memories it SHALL say there are no memories today. After the local date changes, the list SHALL show the new day's memories at the latest when the Paloma window next gets focus.

#### Scenario: Memories of the day
- **WHEN** today has memories for 2023 and 2016
- **THEN** the Memories section lists `3 years ago` and `10 years ago` with their covers and counts

#### Scenario: No memories
- **WHEN** no past year has 3 photos around today's date
- **THEN** the Memories section says there are no memories today

#### Scenario: Next day
- **WHEN** Paloma stays open past midnight and the user returns to its window
- **THEN** the Memories section lists the memories of the new date

### Requirement: Open a memory
Choosing a memory SHALL show its photos in the grid, with the memory's name, photo count and date range above them. A memory view SHALL offer no editing of the memory itself. Selecting photos, the tray, starring, search and the slideshow SHALL work in it as in an album view, at the active level.

#### Scenario: Open a memory
- **WHEN** the user chooses `Kyiv in '91` in the sidebar
- **THEN** the grid shows only its photos, the header shows `Kyiv in '91` and its photo count, and no Edit properties or Delete button is shown

#### Scenario: Slideshow of a memory
- **WHEN** a memory is open and the user starts the slideshow
- **THEN** the slideshow plays the photos of the memory
