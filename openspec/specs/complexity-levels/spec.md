# complexity-levels Specification

## Purpose

Lets each user see only the tools that fit them, from a locked-down Child mode for looking at albums to a Developer mode that shows everything, by giving every control and plugin a level.

## Requirements

### Requirement: Five ordered levels
Paloma SHALL have exactly five levels, from lowest to highest: Child (`child`), Easy (`easy`), Normal (`normal`), Professional (`pro`) and Developer (`developer`). Exactly one level SHALL be active. A control or plugin filter with a level SHALL be available at that level and at every higher level, and SHALL be hidden at lower levels.

#### Scenario: Higher level includes lower ones
- **WHEN** a control has level Easy and the active level is Professional
- **THEN** the control is available

#### Scenario: Lower level hides
- **WHEN** a control has level Normal and the active level is Easy
- **THEN** the control is not shown

#### Scenario: Developer shows everything
- **WHEN** the active level is Developer
- **THEN** every control and every filter of an active plugin is available, whatever its level

### Requirement: Default level is Normal
When no level has been chosen in this browser, the active level SHALL be Normal. At Normal, every view and control that Paloma offered before levels existed SHALL be available.

#### Scenario: First start
- **WHEN** the user opens Paloma for the first time in a browser
- **THEN** the level is Normal and the people, map, collage, plugins and settings views, the tray and the edit bar are all available

### Requirement: Hidden means not shown
A control that is not available at the active level SHALL NOT be shown, not even disabled. Hidden controls SHALL NOT be reachable by keyboard shortcuts. A view that is not available SHALL NOT be listed in the navigation.

#### Scenario: Keyboard does not reach hidden editing
- **WHEN** the level is Child and the user presses keys in the photo viewer
- **THEN** no filter panel opens and no edit is made

### Requirement: Levels of current controls
The current controls SHALL have these levels. Child: library view limited to albums, the album list in the sidebar, opening photos in the viewer with its navigation bar and zoom, the slideshow, the entry menu with its Slideshow item, the Settings view (behind the PIN), and the user menu with the user's name and, when auth is on, Log out. Easy: the Account view with the profile, Change password and the logged-in devices, the shortcuts, memories, tags, people and folders sidebar lists, opening a memory, choosing a person to see their photos, search, selecting photos and the tray with Add to album, Add tags, Remove tag, Remove from album, Make cover, Clear, Export and Print, starring, the entry menu's Information item and the entry links it shows, and the viewer's Info button and panel with editing the description and tags and the list of people on the photo, and the viewer's Faces toggle with its frames. Professional: the EXIF section of the Info panel. Developer: the JSON section of the Info panel. Normal: all other current views and controls, including the Server settings view with its Plugins section, the tokens list of the Account view, the Admin view, the entry menu's Map item, the People view, adding, editing and deleting people, adding, assigning and removing people on a photo, assigning a face from its frame, the Unrecognized faces entry and view, face detection and Similar faces.

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

### Requirement: Child mode is view-only
At Child, nothing SHALL be offered that changes photos, albums, locations, edits, plugins or files. The sidebar SHALL show only the album list. The library SHALL show the photos of the chosen album, and, when no album is chosen, a message asking to choose one. Photo cards SHALL open the viewer and SHALL NOT offer selecting or starring. The viewer SHALL show its navigation bar without the edit bar.

#### Scenario: Child opens an album
- **WHEN** the level is Child and the user chooses the album `Birds`
- **THEN** the grid shows the photos of `Birds`, without selection checkboxes or star corners, and no tray is shown

#### Scenario: Child in the viewer
- **WHEN** the level is Child and the user opens a photo
- **THEN** the viewer shows the photo with Close, Previous, Next and zoom, and no edit bar

#### Scenario: No album chosen
- **WHEN** the level becomes Child while a folder is shown in the library
- **THEN** the library shows no folder photos and asks the user to choose an album

#### Scenario: Ctrl-click does not select
- **WHEN** the level is Child and the user Ctrl-clicks a photo card
- **THEN** no photo is selected

### Requirement: Plugin filters follow the level
The edit bar SHALL offer a filter of an active plugin only when the active level is at least the plugin's level and at least the filter's level. Steps of a filter hidden by the level SHALL still be rendered in thumbnails, previews, the viewer and exports, and SHALL be kept when other steps are edited.

#### Scenario: Easy offers effects but not crop
- **WHEN** the level is Easy and the user opens a photo in the viewer
- **THEN** the edit bar offers brightness, contrast, black & white and sepia, and does not offer crop, rotate, flip or straighten

#### Scenario: Hidden filter still renders
- **WHEN** a photo has a crop step and the level is Easy
- **THEN** the viewer and the thumbnail show the photo cropped

#### Scenario: Plugin tagged Professional
- **WHEN** an active plugin declares level Professional and the level is Normal
- **THEN** none of its filters are in the edit bar

### Requirement: Changing the level applies at once
A new level SHALL take effect at once, without reloading the page, in the navigation and every view. Switching to Child SHALL clear the photo selection and close any open dialog.

#### Scenario: Navigation follows at once
- **WHEN** the level is Normal and the user chooses Easy in Settings
- **THEN** the Settings view stays open, and the navigation at once lists only Library and Settings

#### Scenario: Switch to Child with photos selected
- **WHEN** three photos are selected and the user sets the level to Child
- **THEN** the selection is empty and no tray is shown

### Requirement: Level section in Settings
The Settings view SHALL have a Level section that lists the five levels, each with its name and a one-sentence description in the active language, and marks the active one. Choosing a level SHALL make it active.

#### Scenario: Choose Professional
- **WHEN** the user chooses Professional in the Level section
- **THEN** Professional is marked as active and stays active after a reload

### Requirement: Choosing Child sets a PIN
Choosing Child SHALL ask the user to enter a new PIN of 4 to 8 digits twice. Child SHALL become active only when both entries match and are valid. Cancelling SHALL keep the previous level.

#### Scenario: PIN entered twice
- **WHEN** the user chooses Child and enters `2580` twice
- **THEN** the level is Child

#### Scenario: Entries differ
- **WHEN** the user chooses Child and enters `2580` and then `2581`
- **THEN** the dialog says the PINs differ and the level does not change

#### Scenario: Too short
- **WHEN** the user enters `123` as the new PIN
- **THEN** the dialog says the PIN must have 4 to 8 digits

### Requirement: Settings are locked at Child
At Child, opening the Settings view SHALL first ask for the PIN. A correct PIN SHALL open Settings with every section that Child allows. Leaving the Settings view SHALL lock it again. Cancelling the PIN entry SHALL keep the current view.

#### Scenario: Correct PIN
- **WHEN** the level is Child with PIN `2580` and the user opens Settings and enters `2580`
- **THEN** the Settings view is shown

#### Scenario: Locked again
- **WHEN** the user unlocked Settings, went back to the library and opens Settings again
- **THEN** the PIN is asked again

#### Scenario: Wrong PIN
- **WHEN** the user enters a wrong PIN
- **THEN** the dialog says the PIN is wrong and Settings stay closed

### Requirement: Wrong PINs make the user wait
After five wrong PINs in a row, PIN entry SHALL be refused for 30 seconds, and the dialog SHALL show how long to wait. A correct PIN SHALL reset the count.

#### Scenario: Five wrong PINs
- **WHEN** the user enters a wrong PIN five times in a row
- **THEN** the dialog refuses further entries for 30 seconds and shows the remaining time

### Requirement: Leaving Child removes the PIN
Choosing any level other than Child in the unlocked Settings view SHALL make that level active and remove the PIN. While the level is Child, the Level section SHALL also offer changing the PIN, which asks for the new PIN twice.

#### Scenario: Back to Normal
- **WHEN** the level is Child, the user unlocks Settings and chooses Normal
- **THEN** the level is Normal and opening Settings later does not ask for a PIN

#### Scenario: Change the PIN
- **WHEN** at Child the user unlocks Settings, chooses Change PIN and enters `1470` twice
- **THEN** the next time Settings are opened, `1470` unlocks them and `2580` does not

### Requirement: Level and PIN are remembered in this browser
The level and the PIN SHALL be kept in the browser they were chosen in, like the other UI settings, and SHALL NOT be sent to the server or written to the photo folders. The PIN SHALL NOT be stored as plain digits. A stored level that is not valid, or Child without a valid stored PIN, SHALL be treated as Normal.

#### Scenario: Survives reload
- **WHEN** the level is Child and the page is reloaded
- **THEN** the level is still Child and Settings still ask for the PIN

#### Scenario: Unknown stored level
- **WHEN** the stored level is `expert`
- **THEN** the level is Normal and the other settings are kept

#### Scenario: PIN not readable in storage
- **WHEN** the user sets PIN `2580` and the stored settings are inspected
- **THEN** the text `2580` does not appear in them

### Requirement: Levels apply in every skin
Every skin SHALL hide and show the same controls for the same level. A skin SHALL NOT offer a control whose level is above the active level.

#### Scenario: Compact at Child
- **WHEN** the skin is Compact and the level is Child
- **THEN** its toolbar shows only Library and Settings, its sidebar shows only the album list, and no tray is shown
