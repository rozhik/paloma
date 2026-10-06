# Spec Delta

## MODIFIED Requirements

### Requirement: Levels of current controls
The current controls SHALL have these levels. Child: library view limited to albums, the album list in the sidebar, opening photos in the viewer with its navigation bar and zoom, the slideshow, and the Settings view (behind the PIN). Easy: the shortcuts, tags and folders sidebar lists, search, selecting photos and the tray with Add to album, Add tags, Remove tag, Remove from album, Make cover, Clear, Export and Print, starring, the top-bar language switcher, and the viewer's Info button and panel with editing the description and tags. Professional: the EXIF section of the Info panel. Developer: the JSON section of the Info panel. Normal: all other current views and controls.

#### Scenario: Easy offers export but not collage
- **WHEN** the level is Easy and the user selects two photos
- **THEN** the tray offers Add to album, Add tags, Clear, Export and Print, and does not offer Collage, Movie, Remove location or Remove tag

#### Scenario: Easy removes a tag in a tag view
- **WHEN** the level is Easy, the tag `birds` is open and the user selects a photo
- **THEN** the tray offers Remove tag

#### Scenario: Easy hides advanced views
- **WHEN** the level is Easy
- **THEN** the navigation lists Library and Settings only

#### Scenario: Album management is Normal
- **WHEN** the level is Easy and the user opens an album
- **THEN** the album header shows its name and description but no Edit properties or Delete button

#### Scenario: Child has no Info
- **WHEN** the level is Child and the user opens a photo and presses `i`
- **THEN** no Info button is shown and no Info panel opens

#### Scenario: Info sections by level
- **WHEN** the user opens the Info panel at Normal, then at Professional, then at Developer
- **THEN** at Normal it has no EXIF or JSON section, at Professional it has EXIF but no JSON, and at Developer it has both
