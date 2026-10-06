# Spec Delta

## MODIFIED Requirements

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
