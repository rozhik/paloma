# folder-scanning Specification

## Purpose
Defines which folders and files from the configuration end up in the photo library, and how the library stays in sync with them while the server runs.

## Requirements

### Requirement: Configured photo folders are scanned on start
When the server starts, it SHALL scan every folder listed in `PALOMA_PHOTOS_DIRS` (comma-separated; relative paths resolve from the server working directory) including all subfolders, and SHALL keep watching them while it runs.

#### Scenario: Two configured folders
- **WHEN** the server starts with `PALOMA_PHOTOS_DIRS=/photos/a,/photos/b`
- **THEN** photos from both folders and their subfolders appear in the library

#### Scenario: No folders configured
- **WHEN** `PALOMA_PHOTOS_DIRS` is empty or not set
- **THEN** the server starts and scans nothing

### Requirement: Folders are configured only in .env
The library SHALL get its folders only from `PALOMA_PHOTOS_DIRS` and `PALOMA_EXCLUDE_DIRS`. Neither the UI nor the API SHALL offer a way to add or scan a folder at runtime.

#### Scenario: No add-folder control
- **WHEN** the user opens the library screen
- **THEN** there is no "Add folder" button or dialog

#### Scenario: Scan API is not available
- **WHEN** a client sends `POST /api/folders/scan`
- **THEN** the server responds 404

#### Scenario: Empty library hint
- **WHEN** the library has no folders
- **THEN** the sidebar tells the user to set `PALOMA_PHOTOS_DIRS` in `.env`

### Requirement: Missing configured folder does not stop the server
If a folder listed in `PALOMA_PHOTOS_DIRS` does not exist, the server SHALL log an error naming the folder and SHALL continue starting and scanning the other folders.

#### Scenario: One folder missing
- **WHEN** `PALOMA_PHOTOS_DIRS=/photos/a,/missing` and `/missing` does not exist
- **THEN** the error for `/missing` is logged and photos from `/photos/a` appear in the library

### Requirement: Each directory with photos is a separate library folder
Every directory that directly contains at least one indexed photo SHALL appear in the library as its own folder, identified by its absolute path and named after its last path segment. Scanning the same directory again SHALL NOT create a second folder.

#### Scenario: Nested directories
- **WHEN** `/photos/2024/trip/img.jpg` is found while scanning `/photos`
- **THEN** the library has a folder `trip` with path `/photos/2024/trip` containing `img.jpg`

#### Scenario: Server restart
- **WHEN** the server is restarted with the same configuration
- **THEN** each directory still appears exactly once in the library

### Requirement: Only supported image files are indexed
Only files with the extensions `.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`, `.bmp` or `.heic` (case-insensitive) SHALL be indexed. All other files SHALL be ignored.

#### Scenario: Upper-case extension
- **WHEN** a configured folder contains `IMG_001.JPG`
- **THEN** it appears in the library

#### Scenario: Non-image file
- **WHEN** a configured folder contains `notes.txt` or `clip.mp4`
- **THEN** the file does not appear in the library

### Requirement: Hidden, dependency and excluded paths are skipped
Files and folders whose name starts with a dot, folders named `node_modules`, and every folder listed in `PALOMA_EXCLUDE_DIRS` (comma-separated, absolute or relative) together with all its subfolders SHALL NOT be scanned or watched. The exceptions are a folder's sidecar `.paloma.json` and its Picasa file `.picasa.ini` or `picasa.ini` (any letter case) directly inside a scanned folder. They SHALL be read and watched, and SHALL NOT appear in the library as photos.

#### Scenario: Excluded subfolder
- **WHEN** `PALOMA_EXCLUDE_DIRS=/photos/tmp` and `/photos/tmp/x/a.jpg` exists inside configured `/photos`
- **THEN** `a.jpg` does not appear in the library

#### Scenario: Hidden folder
- **WHEN** a configured folder contains `.picasaoriginals/img.jpg`
- **THEN** that copy does not appear in the library

#### Scenario: Sidecar and Picasa file are watched
- **WHEN** `.paloma.json` or `.picasa.ini` in a scanned folder changes while the server runs
- **THEN** the change is applied to the library, and neither file appears as a photo

#### Scenario: Picasa file in a hidden folder
- **WHEN** a configured folder contains `.picasaoriginals/.picasa.ini`
- **THEN** that file is neither read nor watched

#### Scenario: Sidecar in an excluded folder
- **WHEN** `/photos/tmp/.paloma.json` exists and `PALOMA_EXCLUDE_DIRS=/photos/tmp`
- **THEN** that sidecar is neither read nor watched

### Requirement: Photos are indexed once
A photo SHALL appear in the library at most once per file path, regardless of how many times its folder is scanned and even when one configured folder is inside another configured folder.

#### Scenario: Rescan without changes
- **WHEN** the server is restarted and nothing changed on disk
- **THEN** the number of photos in the library stays the same

#### Scenario: Nested configured folders
- **WHEN** `PALOMA_PHOTOS_DIRS=/photos,/photos/2024`
- **THEN** each photo under `/photos/2024` appears in the library exactly once

### Requirement: A broken file does not stop the scan
If a single file cannot be read or decoded, the server SHALL log an error naming the file and SHALL continue indexing the remaining files.

#### Scenario: Corrupt image among good ones
- **WHEN** a folder contains one corrupt `.jpg` and ten valid photos
- **THEN** the error is logged and the ten valid photos appear in the library

### Requirement: Photos added while running appear in the library
While the server runs, a supported file added anywhere under a watched folder SHALL be indexed and appear in the library without a restart. A file that is still being written SHALL be indexed only after writing has finished.

#### Scenario: Copy a photo in
- **WHEN** a new `.jpg` is copied into a watched folder
- **THEN** it appears in the library without restarting the server

#### Scenario: New subfolder
- **WHEN** a new subfolder with photos is copied into a watched folder
- **THEN** the subfolder appears as a new library folder with its photos

### Requirement: Photos deleted while running leave the library
While the server runs, deleting a photo file under a watched folder SHALL remove that photo from the library. The library SHALL keep no data that refers to the removed photo.

#### Scenario: Delete a photo
- **WHEN** an indexed photo file is deleted from disk
- **THEN** it no longer appears in the library

### Requirement: Photos changed while running are re-indexed
While the server runs, when the content of an indexed photo file changes, the library SHALL update that photo's dimensions, capture date, location and thumbnails from the new content. The photo's star and saved edits SHALL be kept.

#### Scenario: Photo rotated in another program
- **WHEN** a starred photo is rotated and saved in place by another program
- **THEN** the library shows the rotated thumbnail and new dimensions, and the photo is still starred

### Requirement: Library follows the configured folders
On start, the server SHALL remove from the library every folder, with all its photos and their data, that is not inside any folder of `PALOMA_PHOTOS_DIRS` or is inside a folder of `PALOMA_EXCLUDE_DIRS`. Files on disk SHALL NOT be modified or deleted.

#### Scenario: Folder removed from configuration
- **WHEN** `/photos/b` is removed from `PALOMA_PHOTOS_DIRS` and the server restarts
- **THEN** no photos from `/photos/b` appear in the library and the files in `/photos/b` are unchanged

#### Scenario: Folder newly excluded
- **WHEN** `/photos/a/private` is added to `PALOMA_EXCLUDE_DIRS` and the server restarts
- **THEN** no photos from `/photos/a/private` appear in the library

#### Scenario: Folder added back
- **WHEN** a removed folder is added back to `PALOMA_PHOTOS_DIRS` and the server restarts
- **THEN** its photos appear in the library again

### Requirement: Temporarily missing configured folder is kept
A folder that is still listed in `PALOMA_PHOTOS_DIRS` but does not exist on start (for example, an unplugged disk) SHALL keep its photos in the library.

#### Scenario: External disk unplugged
- **WHEN** `/Volumes/Archive` is configured, already indexed, and not mounted when the server starts
- **THEN** its photos stay in the library

### Requirement: The library stays usable during a scan
While the server scans or re-indexes folders, on start or because files changed, it SHALL keep answering API requests. Photos indexed so far SHALL be listed, and a request SHALL NOT wait for the scan to finish.

#### Scenario: Browsing during the initial scan
- **WHEN** the server starts with a configured folder of thousands of photos and a client requests `GET /api/photos` before the scan has finished
- **THEN** the server responds without waiting for the scan to end, with the photos indexed so far

#### Scenario: Changing a photo during a scan
- **WHEN** a client stars an already indexed photo while another folder is still being scanned
- **THEN** the request succeeds without waiting for the scan to end, and the photo stays starred after the scan finishes

#### Scenario: Re-applying a large folder's sidecar
- **WHEN** `.paloma.json` of a folder with thousands of photos is edited outside Paloma, and a client requests `GET /api/folders` meanwhile
- **THEN** the server responds to the request while the folder's fields are still being applied

### Requirement: Scans run as system tasks
The start-up scan of each configured folder SHALL run as a `scan` task started by Paloma. Changes the watchers find while the server runs SHALL be applied by a `scan` task for that configured folder; changes found while such a task waits SHALL join it. A new scan task SHALL be placed after the waiting scan tasks and before every waiting user task. Its progress SHALL count the files checked.

#### Scenario: Start-up scans
- **WHEN** the server starts with `PALOMA_PHOTOS_DIRS=/photos/a,/photos/b`
- **THEN** the Tasks view shows a scan task for `/photos/a` and one for `/photos/b`, started by Paloma, ahead of any user task

#### Scenario: Photos copied in during an AI task
- **WHEN** an AI task is running and 20 photos are copied into `/photos/a`
- **THEN** one scan task for `/photos/a` waits ahead of the user tasks, and the photos appear in the library after the AI task ends and the scan task has run

#### Scenario: More changes while waiting
- **WHEN** a scan task for `/photos/a` is waiting and another photo is copied into `/photos/a`
- **THEN** no second scan task is added and the waiting one also indexes the new photo

### Requirement: Pausing and cancelling a scan
A paused or cancelled scan task SHALL keep the photos indexed so far. Resuming a paused scan SHALL check the rest of its files. After a cancelled scan, files it did not check SHALL be checked by the next scan of that folder, at the latest at the next start.

#### Scenario: Cancel the start-up scan
- **WHEN** an administrator cancels the start-up scan of `/photos/a` after half of its photos were indexed
- **THEN** those photos stay in the library, and the rest appear after the next server start
