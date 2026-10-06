# Spec Delta

## MODIFIED Requirements

### Requirement: Searched texts
A photo's searched texts SHALL be: its file name, its folder's path, its description, its tags, the shown names and descriptions of its albums, the shown names and aliases of the people on it, its place name in every language Paloma has looked up, and the camera make and model from its EXIF. Only the photo's current values SHALL be searched: a description or tag removed in the sidecar SHALL NOT be found.

#### Scenario: Album name
- **WHEN** `a.jpg` is in the album `Birds of Ukraine` and the user searches `birds`
- **THEN** `a.jpg` is found

#### Scenario: Person
- **WHEN** Picasa faces name `Roy Avery` on `a.jpg` and the user searches `avery`
- **THEN** `a.jpg` is found

#### Scenario: Person's alias
- **WHEN** `Roy Avery` has the alias `Bear` in Paloma, is on `a.jpg`, and the user searches `bear`
- **THEN** `a.jpg` is found

#### Scenario: Camera model
- **WHEN** `a.jpg` was taken with a camera whose EXIF model is `Canon EOS 80D` and the user searches `80d`
- **THEN** `a.jpg` is found

#### Scenario: Removed embedded description
- **WHEN** `a.jpg` has the IPTC caption `Market day`, its entry has `"caption": ""`, and the user searches `market`
- **THEN** `a.jpg` is not found by its description

### Requirement: Search follows changes at once
After the user changes a description, tags, an album name, a photo's location, a person's name or alias, or the people on a photo, the next search SHALL use the new values, without a rescan or restart.

#### Scenario: Tag then search
- **WHEN** the user adds the tag `kayak` to `a.jpg` and then searches `kayak`
- **THEN** `a.jpg` is found

#### Scenario: Renamed person
- **WHEN** the user renames `Roy Avery` to `Roy Bear` and then searches `bear`
- **THEN** the photos of that person are found
