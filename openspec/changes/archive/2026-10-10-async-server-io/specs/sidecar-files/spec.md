# Spec Delta

## ADDED Requirements

### Requirement: Concurrent changes to one folder are all saved
When several changes to photos of the same folder arrive at the same time, Paloma SHALL save every one of them to `.paloma.json`. No change SHALL overwrite another one made at the same time, and the library SHALL show all of them.

#### Scenario: Two photos changed at once
- **WHEN** a client sends `PATCH /api/photos/7` with `{"isStarred": true}` and, before it is answered, `PATCH /api/photos/8` with `{"caption": "Dusk"}`, and both photos are in the same folder
- **THEN** both requests succeed, `.paloma.json` has `"star": true` for photo 7 and `"caption": "Dusk"` for photo 8, and the library shows both

#### Scenario: Batch change racing a single change
- **WHEN** `POST /api/photos/keywords` adds the tag `trip` to photos 7 and 8 while `PATCH /api/photos/7` sets its caption, all in one folder
- **THEN** photo 7 has both the tag `trip` and the new caption, and photo 8 has the tag `trip`

#### Scenario: Change racing an outside edit being applied
- **WHEN** a client stars photo 7 while Paloma is applying an outside edit of the same folder's `.paloma.json`
- **THEN** the star is saved in `.paloma.json` and the outside edit is kept as well
