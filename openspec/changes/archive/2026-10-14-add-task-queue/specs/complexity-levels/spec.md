# Spec Delta

## MODIFIED Requirements

### Requirement: Levels of current controls
The current controls SHALL have these levels. Child: library view limited to albums, the album list in the sidebar, opening photos in the viewer with its navigation bar and zoom, the slideshow, the entry menu with its Slideshow item, the Settings view (behind the PIN), and the user menu with the user's name and, when auth is on, Log out. Easy: the Account view with the profile, Change password and the logged-in devices, the shortcuts, memories, tags, people and folders sidebar lists, opening a memory, choosing a person to see their photos, search, selecting photos and the tray with Add to album, Add tags, Remove tag, Remove from album, Make cover, Clear, Export and Print, starring, the entry menu's Information item and the entry links it shows, and the viewer's Info button and panel with editing the description and tags and the list of people on the photo, and the viewer's Faces toggle with its frames, and the Tasks view and the task indicator with pausing, resuming, cancelling and moving the user's tasks. Professional: the EXIF section of the Info panel. Developer: the JSON section of the Info panel. Normal: all other current views and controls, including the Server settings view with its Plugins section, the tokens list of the Account view, the Admin view, the entry menu's Map item, the People view, adding, editing and deleting people, adding, assigning and removing people on a photo, assigning a face from its frame, the Unrecognized faces entry and view, face detection and Similar faces.

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

#### Scenario: Easy sees people but does not edit them
- **WHEN** the level is Easy, the user chooses `Roy Avery` in the sidebar and opens the Info panel of one of his photos
- **THEN** the grid shows his photos without the face detection button, the Similar faces switch or an Edit button, and the People section lists `Roy Avery` without add, remove or assign controls

#### Scenario: Child sees no people
- **WHEN** the level is Child
- **THEN** the sidebar has no People list and no person can be chosen

#### Scenario: Easy sees frames but does not assign
- **WHEN** the level is Easy, Faces is on and the user clicks an unassigned frame
- **THEN** nothing opens and no face is assigned

#### Scenario: Memories from Easy
- **WHEN** the level is Child, and then Easy, and today has memories
- **THEN** at Child the sidebar has no Memories section, and at Easy it lists the memories and the user can open one

#### Scenario: Entry menu by level
- **WHEN** the user opens the menu of album `Trip` at Child, then at Easy, then at Normal
- **THEN** at Child it offers only Slideshow, at Easy Slideshow and Information, and at Normal also Find faces, Map, Edit properties and Delete

#### Scenario: Plugins section from Normal
- **WHEN** the user opens the user menu at Easy and then at Normal
- **THEN** at Easy it has no Server settings item, and at Normal it has one

#### Scenario: User menu at Child
- **WHEN** auth is on, the level is Child and the user opens the user menu
- **THEN** it shows the user's name and offers only Log out

#### Scenario: Admin view from Normal
- **WHEN** auth is on, an administrator has level Easy and then Normal
- **THEN** at Easy the user menu has no Admin item, and at Normal it has one

#### Scenario: Tasks from Easy
- **WHEN** the level is Child, and then Easy, and the user has an export task waiting
- **THEN** at Child no task indicator is shown and the user menu has no Tasks item, and at Easy both are shown
