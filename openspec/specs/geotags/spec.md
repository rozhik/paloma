# geotags Specification

## Purpose

Defines the location of a photo: where it comes from (the folder's `.paloma.json`, the Picasa `.ini`, the photo's EXIF GPS), how the user sets or clears it without touching the photo file, and how photos are filtered by having a location.

## Requirements

### Requirement: A photo has one effective location
A photo's location in the library SHALL be, in this order: the readable `geotag` of its entry in the folder's `.paloma.json`; while the folder has no `.paloma.json`, the `geotag` of its Picasa `.ini` section; otherwise the GPS position in the photo's EXIF. A `geotag` of `null` SHALL mean the photo has no location, even if its EXIF has GPS. A photo with none of these SHALL have no location.

#### Scenario: Camera location
- **WHEN** `a.jpg` has EXIF GPS 48.160833 N, 24.500278 E and no `geotag` in the folder files
- **THEN** `a.jpg` has the location 48.160833, 24.500278

#### Scenario: Sidecar overrides the camera
- **WHEN** `a.jpg` has EXIF GPS and its sidecar entry has `"geotag": { "lat": 50.45, "lon": 30.5234 }`
- **THEN** `a.jpg` has the location 50.45, 30.5234

#### Scenario: Location removed in the sidecar
- **WHEN** `a.jpg` has EXIF GPS and its sidecar entry has `"geotag": null`
- **THEN** `a.jpg` has no location

#### Scenario: Southern and western hemispheres
- **WHEN** `a.jpg` has EXIF GPS 33.856 S, 151.215 E and `b.jpg` has 40.7128 N, 74.006 W
- **THEN** `a.jpg` has latitude -33.856 and `b.jpg` has longitude -74.006

### Requirement: Sidecar geotag format
A sidecar `geotag` SHALL be either `null` or an object with numeric `lat` in [-90, 90] and numeric `lon` in [-180, 180], in decimal degrees. Paloma SHALL write coordinates rounded to 6 decimal places. Any other `geotag` value SHALL be ignored for the library, as if the entry had no `geotag`, and SHALL be kept in the file until the user changes the location.

#### Scenario: Out of range
- **WHEN** the entry for `a.jpg` has `"geotag": { "lat": 95, "lon": 10 }` and the photo has EXIF GPS
- **THEN** `a.jpg` has the EXIF location and the file still contains the invalid `geotag`

#### Scenario: Rounding
- **WHEN** the user sets the location of `a.jpg` to 48.1608334999, 24.50027777
- **THEN** the entry contains `"geotag": { "lat": 48.160833, "lon": 24.500278 }`

### Requirement: Photo files are never changed for a location
Setting or clearing a location SHALL change only the folder's `.paloma.json`. Paloma SHALL NOT write GPS or any other data into photo files.

#### Scenario: Set location of a JPEG
- **WHEN** the user sets the location of `a.jpg`
- **THEN** the bytes and modification time of `a.jpg` are unchanged

### Requirement: Location follows the folder files and the photo content
The location SHALL be recomputed whenever the folder's `.paloma.json` or Picasa `.ini` changes, and whenever the photo is re-indexed, without a restart. A location from the sidecar SHALL survive a change of the photo's content.

#### Scenario: Library rebuilt from disk
- **WHEN** the library database is deleted and the server starts with a sidecar giving `a.jpg` a `geotag`
- **THEN** `a.jpg` has that location

#### Scenario: Geotag edited in a text editor
- **WHEN** the user adds a `geotag` to the entry for `a.jpg` in `.paloma.json` while the server runs
- **THEN** `a.jpg` has that location without a restart

#### Scenario: Photo edited in another program
- **WHEN** `a.jpg` has a sidecar `geotag` and another program rewrites the file without GPS
- **THEN** `a.jpg` keeps the sidecar location

### Requirement: Photo lists include the location
`GET /api/photos` SHALL return for each photo `latitude` and `longitude` (numbers, or `null` without a location) and `locationSource`: `"exif"` when the location comes from EXIF, `"user"` when it comes from the sidecar or the Picasa `.ini`, and `null` without a location.

#### Scenario: Location set by the user
- **WHEN** a photo's location comes from its sidecar `geotag`
- **THEN** the photo in the response has that `latitude` and `longitude` and `"locationSource": "user"`

### Requirement: Set or clear the location of one photo
`PATCH /api/photos/:id` SHALL accept `location`: an object with numeric `lat` and `lon` in range sets the photo's `geotag`; `null` clears it. Clearing SHALL write `"geotag": null` if the photo's EXIF has GPS, and otherwise remove `geotag` from the entry. Any other value SHALL be rejected with 400 and change nothing.

#### Scenario: Set a location
- **WHEN** a client sends `PATCH /api/photos/7` with `{"location": {"lat": 49.8397, "lon": 24.0297}}`
- **THEN** the response shows the photo at 49.8397, 24.0297 with `"locationSource": "user"`, and its sidecar entry has that `geotag` and a `modified` timestamp

#### Scenario: Clear a camera location
- **WHEN** photo 7 has EXIF GPS and a client sends `{"location": null}`
- **THEN** the photo has no location and its entry has `"geotag": null`

#### Scenario: Clear a location set in Paloma
- **WHEN** photo 7 has no EXIF GPS, its entry has a `geotag`, and a client sends `{"location": null}`
- **THEN** the photo has no location and its entry has no `geotag` key

#### Scenario: Invalid location
- **WHEN** a client sends `{"location": {"lat": "49.8", "lon": 24}}` or `{"location": {"lat": 91, "lon": 0}}`
- **THEN** the server responds 400 with an error code for an invalid location, and nothing changes

### Requirement: Set or clear the location of many photos
`POST /api/photos/location` with `photoIds` (non-empty array of photo ids) and `location` (as in `PATCH /api/photos/:id`) SHALL apply that location to every listed photo and respond with the updated photos. Changes SHALL be saved folder by folder: an unreadable sidecar in any affected folder SHALL reject the request with 409 and write nothing; if writing a folder fails, the folders already written SHALL keep the change and the response SHALL name the folders not changed.

#### Scenario: Photos from two folders
- **WHEN** a client sends `photoIds` of `/photos/a/1.jpg` and `/photos/b/2.jpg` with `{"lat": 46.48, "lon": 30.72}`
- **THEN** both sidecars contain that `geotag` for their photo and both photos have that location

#### Scenario: Unknown photo
- **WHEN** `photoIds` contains an id that is not in the library
- **THEN** the server responds 404 and nothing changes

#### Scenario: One folder has a corrupt sidecar
- **WHEN** one of the affected folders has a `.paloma.json` that is not valid JSON
- **THEN** the server responds 409 naming that sidecar, and no sidecar or location changes

### Requirement: Filter photos by having a location
`GET /api/photos` SHALL accept `geotagged=true` to return only photos with a location and `geotagged=false` to return only photos without one. The library sidebar SHALL offer a "Geotagged" collection that shows only photos with a location.

#### Scenario: Geotagged collection
- **WHEN** a folder has three photos and one of them has a location, and the user opens "Geotagged"
- **THEN** the grid shows only that one photo

#### Scenario: Photos without location
- **WHEN** a client sends `GET /api/photos?geotagged=false`
- **THEN** the response contains only photos whose `latitude` is `null`
