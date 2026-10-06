# photo-search Specification

## Purpose

Defines what the library search finds: which texts of a photo are searched and how a typed query is matched against them.

## Requirements

### Requirement: Every word of the query must match
The search text SHALL be split at white space into words. A photo SHALL match when every word occurs, ignoring letter case beyond ASCII, as part of at least one of the photo's searched texts. Different words MAY match different texts. A query that is empty or only white space SHALL not filter the photos.

#### Scenario: Two words in different texts
- **WHEN** `a.jpg` has the tag `bridge` and is in the folder `/photos/Lviv 2023`, and the user searches `lviv BRIDGE`
- **THEN** `a.jpg` is found

#### Scenario: One word missing
- **WHEN** `a.jpg` has the tag `bridge` and no text contains `river`, and the user searches `bridge river`
- **THEN** `a.jpg` is not found

#### Scenario: Part of a word
- **WHEN** `a.jpg` has the description `Sunrise over hills` and the user searches `rise`
- **THEN** `a.jpg` is found

#### Scenario: Cyrillic in another case
- **WHEN** `a.jpg` has the tag `Київ` and the user searches `київ`
- **THEN** `a.jpg` is found

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

### Requirement: Search narrows the current selection
`GET /api/photos` SHALL accept the search text as `query` and SHALL combine it with the other filters (folder, album, tag, collection, date-taken range, hidden photos). The library search box SHALL search within the current folder, album, tag, collection or memory, and SHALL keep hidden photos out unless they are requested.

#### Scenario: Search inside an album
- **WHEN** the album `Trip` is open and the user searches `bridge`
- **THEN** the grid shows only photos of `Trip` that match `bridge`

#### Scenario: Hidden photo
- **WHEN** a hidden photo has the tag `bridge` and the user searches `bridge`
- **THEN** the hidden photo is not shown

#### Scenario: Search inside a memory
- **WHEN** the memory `10 years ago` is open and the user searches `bridge`
- **THEN** the grid shows only photos of that memory that match `bridge`

### Requirement: Search follows changes at once
After the user changes a description, tags, an album name, a photo's location, a person's name or alias, or the people on a photo, the next search SHALL use the new values, without a rescan or restart.

#### Scenario: Tag then search
- **WHEN** the user adds the tag `kayak` to `a.jpg` and then searches `kayak`
- **THEN** `a.jpg` is found

#### Scenario: Renamed person
- **WHEN** the user renames `Roy Avery` to `Roy Bear` and then searches `bear`
- **THEN** the photos of that person are found
