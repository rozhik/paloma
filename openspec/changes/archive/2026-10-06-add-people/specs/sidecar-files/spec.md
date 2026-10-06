# Spec Delta

## MODIFIED Requirements

### Requirement: Sidecar is created only by a user change
Paloma SHALL NOT create `.paloma.json` while scanning, indexing, watching or detecting faces in a folder. It SHALL create it only when the user changes a photo field, an album or a person mark in that folder. Paloma SHALL modify an existing `.paloma.json` only on a user change or to re-import a changed Picasa `.ini`.

#### Scenario: Scanning a folder
- **WHEN** a folder without `.paloma.json` is scanned and indexed, with or without a `.picasa.ini`
- **THEN** no `.paloma.json` is created in it

#### Scenario: First change in a folder
- **WHEN** the user stars a photo in a folder without `.paloma.json`
- **THEN** `.paloma.json` is created in that folder

#### Scenario: First album change in a folder
- **WHEN** the user adds a photo to an album in a folder without `.paloma.json`
- **THEN** `.paloma.json` is created in that folder

#### Scenario: First person mark in a Picasa folder
- **WHEN** the user adds `Ann` to `a.jpg` in a folder with `.picasa.ini` and no `.paloma.json`
- **THEN** `.paloma.json` is created with the Picasa import, and the entry for `a.jpg` has the face of `Ann` and `modified`

#### Scenario: Editing a profile
- **WHEN** the user changes the alias of `Roy Avery`
- **THEN** no `.paloma.json` is created or changed
