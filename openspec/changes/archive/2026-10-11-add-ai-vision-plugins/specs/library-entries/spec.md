## MODIFIED Requirements

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
