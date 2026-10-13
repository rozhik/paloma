# Spec Delta

## Purpose

Defines keyboard control of Paloma: the catalog of actions that can have keys, keymaps and their JSON file, the preset keymaps, each user's own keymap kept on the server, choosing and editing it, and how a key press reaches an action.

## ADDED Requirements

### Requirement: Action catalog
Paloma SHALL have a catalog of keyboard actions. On the library, viewer, slideshow, People, Map and Collage screens it SHALL contain every action that is the only one of its kind on the screen, such as closing the viewer or opening Settings, and every action on the selected photos or the shown photo, such as starring or rotating, including each edit bar filter. Each action SHALL have a stable id, a name in the active language and one section.

#### Scenario: Selection action
- **WHEN** the user looks up starring in the catalog
- **THEN** it has the id `selection.star`, the section Selection and a name in the active language

#### Scenario: Plugin filter
- **WHEN** a plugin with a filter is switched on
- **THEN** the catalog has an Edit action for that filter

#### Scenario: Forms are not in the catalog
- **WHEN** the user is in the Account view or a dialog
- **THEN** Tab, Enter and Esc work as usual and the catalog has no actions for the form's buttons

#### Scenario: New control gets an action
- **WHEN** a button is added that is the only one of its kind on its screen, or acts on the selection
- **THEN** the catalog has an action for it

### Requirement: Sections
The catalog SHALL group actions into these sections, in this order: Global, Library, Selection, Viewer, Edit, Slideshow, People, Map, Collage. Global actions SHALL work on every screen. Library and Selection SHALL work while the photo grid is shown, Viewer and Edit while the viewer is open, and each other section while its screen is shown. No section other than Global SHALL work while a dialog is open.

#### Scenario: Viewer key outside the viewer
- **WHEN** the library is shown and the user presses the key of Viewer → Next photo
- **THEN** nothing happens

#### Scenario: Global key in the viewer
- **WHEN** the viewer is open and the user presses the key of Global → Open Settings
- **THEN** the Settings view opens

### Requirement: Keymap
A keymap SHALL have a name of 1 to 64 characters, the id of the preset it is based on, and its sections, each listing its actions with zero or more keys. A key SHALL be a key name with optional Ctrl, Alt, Shift and Meta modifiers. An action the keymap does not list SHALL have the keys of its preset; an action listed with no keys SHALL have none.

#### Scenario: Several keys
- **WHEN** the keymap gives Viewer → Next photo the keys `ArrowRight` and `PageDown`
- **THEN** either key in the viewer shows the next photo

#### Scenario: Action added later
- **WHEN** a keymap saved before an action existed is loaded, based on `windows`
- **THEN** that action has the keys it has in `windows`

#### Scenario: Unbound on purpose
- **WHEN** the keymap lists Selection → Star with no keys
- **THEN** no key stars photos, even though the preset has one

### Requirement: Keys are unique within their scope
A key SHALL be bound at most once among the sections that work at the same time: Global with every other section, Library with Selection, and Viewer with Edit. Paloma SHALL refuse to save a keymap that breaks this, and SHALL name the actions that share the key.

#### Scenario: Duplicate in a section
- **WHEN** the user tries to give Viewer → Close the key that Viewer → Info panel already has
- **THEN** the change is refused and both action names are shown

#### Scenario: Viewer and Edit share a scope
- **WHEN** the user tries to bind `R` to Edit → Rotate while Viewer → Info panel has `R`
- **THEN** the change is refused

#### Scenario: Same key in two screens
- **WHEN** `ArrowRight` is bound in Viewer and in Slideshow
- **THEN** the keymap is accepted

### Requirement: Preset keymaps
Paloma SHALL ship the preset keymaps `mac`, `windows` and `tvBox`, in this order, with names in the active language. Presets SHALL NOT be changed by any user. In `mac` and `windows` every catalog action SHALL have at least one key, except filters of plugins not bundled with Paloma, which SHALL be unbound. `tvBox` SHALL use only keys a TV remote sends (arrows, Enter, Back, media keys, digits and the colour keys) without modifiers; actions with no fitting key SHALL be unbound.

#### Scenario: Undo key per platform
- **WHEN** the user's keymap is `mac`, and then `windows`
- **THEN** undo in the viewer is `Meta+Z` with `mac` and `Ctrl+Z` with `windows`

#### Scenario: Remote control
- **WHEN** the keymap is `tvBox`, the viewer is open and the remote's Back button is pressed
- **THEN** the viewer closes

#### Scenario: Current keys kept
- **WHEN** the keymap is `windows`
- **THEN** the viewer and slideshow keys are the ones Paloma had before keymaps: Esc, `←`, `→`, `i`, `f`, Space, `+`, `-`, `0` and `Ctrl+Z`

### Requirement: Each user has one keymap on the server
Each user SHALL have exactly one keymap, kept in Paloma's database on the server and never in the photo folders. With users off, the single user SHALL have one. The same keymap SHALL apply in every browser the user logs in from. Deleting a user SHALL delete their keymap.

#### Scenario: Another browser
- **WHEN** `anna` changes a key in one browser and logs in from another
- **THEN** the other browser uses her changed key

#### Scenario: Users are separate
- **WHEN** `anna` changes a key
- **THEN** `ben`'s keymap is unchanged

#### Scenario: Nothing in the photo folders
- **WHEN** a user saves a keymap
- **THEN** no file in any photo folder is created or changed

### Requirement: Default keymap
Until a user has chosen a preset or saved a change, their keymap SHALL be a copy of `mac` on Apple devices and of `windows` on every other device, and nothing SHALL be stored for them. If the server cannot be reached for the keymap, the client SHALL use this default and keep working.

#### Scenario: First login on a Mac
- **WHEN** a new user logs in for the first time from a Mac
- **THEN** their keys are those of `mac`

#### Scenario: Server unreachable
- **WHEN** the keymap request fails
- **THEN** the default keymap of the device is used and the photos can still be browsed with the keyboard

### Requirement: Choose a preset in Settings
At Normal level and up, Settings SHALL have a Keyboard section showing the name of the user's keymap and the preset it is based on, offering the presets to choose from, and opening the Keybindings page. Choosing a preset SHALL ask for confirmation if the keymap has changes of its own, then replace the keymap with a copy of that preset and save it on the server.

#### Scenario: Choose tvBox
- **WHEN** the user chooses `tvBox` in Settings → Keyboard
- **THEN** their keymap becomes a copy of `tvBox`, the remote's arrows move through the photos, and the choice applies in their other browsers too

#### Scenario: Own changes are confirmed
- **WHEN** the user has rebound a key and chooses `windows`
- **THEN** Paloma asks before replacing the keymap, and Cancel keeps it

#### Scenario: Not at Easy
- **WHEN** the level is Easy and the user opens Settings
- **THEN** there is no Keyboard section, and the keys of the user's keymap still work

### Requirement: Keybindings page
At Normal level and up, the Keybindings page SHALL be a view of its own, opened from Settings → Keyboard. It SHALL show the keymap's name, which can be changed, and its sections in catalog order, each listing its actions by name with their keys. It SHALL offer a filter by action name or key, and a way back to Settings.

#### Scenario: Open the page
- **WHEN** the user chooses Edit keys in Settings → Keyboard
- **THEN** the Keybindings page shows the keymap's sections with every action and its keys

#### Scenario: Filter by key
- **WHEN** the user types `Space` into the filter
- **THEN** only the actions bound to Space are listed

### Requirement: Edit keys
On the Keybindings page the user SHALL be able to add a key to an action by pressing it, remove a key, reset one action to its preset keys and reset the whole keymap to its preset. Every change SHALL be saved on the server at once and apply without reloading. If saving fails, the page SHALL show the error and keep the last saved keymap.

#### Scenario: Add a key
- **WHEN** the user chooses Add key on Viewer → Next photo and presses `N`
- **THEN** `N` is listed for that action and pressing `N` in the viewer shows the next photo

#### Scenario: Capture any key
- **WHEN** the user is adding a key and presses Esc
- **THEN** Esc is recorded as the key, and capture ends only with Cancel or a recorded key

#### Scenario: Conflict offers to move
- **WHEN** the user presses a key that another action of the same scope has
- **THEN** the page names that action and offers to move the key to the new action, or cancel

#### Scenario: Reset one action
- **WHEN** the user resets Selection → Star
- **THEN** it has the keys of the keymap's preset again

#### Scenario: Save fails
- **WHEN** the server refuses a change
- **THEN** the page shows the error and the keys are those last saved

### Requirement: Download and upload a keymap
At Professional level and up, the Keybindings page SHALL download the keymap as a JSON file and upload a JSON file to replace it after confirmation. The file SHALL hold a format marker and version, the name, the preset it is based on, and per section the action ids, their English names and keys. Names in the file SHALL be ignored on upload.

#### Scenario: Download
- **WHEN** the user chooses Download on the Keybindings page
- **THEN** a `.json` file named after the keymap is saved, and uploading it again gives the same keys

#### Scenario: Not at Normal
- **WHEN** the level is Normal
- **THEN** the Keybindings page offers no Download or Upload

#### Scenario: Upload from another install
- **WHEN** the user uploads a keymap downloaded from another Paloma and confirms
- **THEN** their keymap is replaced by it and saved on the server

### Requirement: Invalid keymaps are refused
The server SHALL refuse with 400 a keymap that is not valid JSON, lacks the format marker, has a newer version than it supports, names an unknown preset, has an invalid name or key, or breaks key uniqueness, and SHALL keep the stored keymap. Unknown sections and action ids SHALL be dropped and reported, not refused; well-formed filter actions of plugins that are not installed SHALL be kept. A file over 256 KB SHALL be refused.

#### Scenario: Unknown action
- **WHEN** the user uploads a keymap with an action id this Paloma does not know
- **THEN** the keymap is saved without it and the page says which id was dropped

#### Scenario: Not a keymap
- **WHEN** the user uploads a photo's `.paloma.json`
- **THEN** the upload is refused, the page says the file is not a keymap, and the keymap is unchanged

### Requirement: Keys reach only allowed actions
A key SHALL run its action only when the level and the user's permissions allow the control behind it and the action can be done now, for example a selection action only while photos are selected. Otherwise the key SHALL do nothing and SHALL keep its browser default.

#### Scenario: Below the level
- **WHEN** the level is Easy and the user presses the key of Library → Open the map
- **THEN** the Map view does not open

#### Scenario: Without permission
- **WHEN** a Viewer presses the key of Selection → Star with photos selected
- **THEN** no photo is starred

#### Scenario: Nothing selected
- **WHEN** no photo is selected and the user presses the key of Selection → Add to album
- **THEN** nothing happens

### Requirement: Typing goes to the field
While a text field, text area, list box or slider has keyboard focus, every key SHALL go to that control and SHALL NOT run a keymap action. Esc SHALL first be offered to the control, and SHALL run its action only if the control does not use it.

#### Scenario: Typing a letter bound to an action
- **WHEN** `i` opens the Info panel and the user types `i` into the search field
- **THEN** the letter goes into the field and no panel opens

#### Scenario: Undo in a text field
- **WHEN** the user presses `Ctrl+Z` while editing a description
- **THEN** the text field undoes its typing and no photo edit is undone

### Requirement: Arrow keys mirror in right-to-left languages
In a right-to-left UI language, `ArrowLeft` and `ArrowRight` SHALL swap before the keymap is looked up, so the key bound to the next photo on the right moves to the left.

#### Scenario: Arabic
- **WHEN** the UI language is Arabic, Viewer → Next photo is bound to `ArrowRight` and the user presses `←`
- **THEN** the viewer shows the next photo

### Requirement: Keymap API
The API SHALL let a logged-in user or their API token read and replace their own keymap and list the presets, without any further permission. No user SHALL be able to read or change another user's keymap.

#### Scenario: Read own keymap
- **WHEN** `ben` requests his keymap with his API token
- **THEN** the server returns his keymap, or the note that he has none stored yet

#### Scenario: Viewer saves keys
- **WHEN** a user with the Viewer role saves a keymap
- **THEN** it is saved
