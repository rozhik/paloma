# Spec Delta

## MODIFIED Requirements

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
