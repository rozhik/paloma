# photo-grid Specification

## Purpose

Defines how a photo card in the library grid responds to the user: opening the photo in the viewer, selecting it for the tray, and starring it from the card's corners.

## Requirements

### Requirement: Click opens the photo viewer
A plain click on a photo card, outside its corner controls, SHALL open the photo viewer on that photo, with the photos the grid shows as the viewer's list. It SHALL NOT change the selection.

#### Scenario: Open from the grid
- **WHEN** the grid shows 120 photos and the user clicks the third card's image
- **THEN** the viewer opens on that photo as `3 / 120`, and the tray is unchanged

### Requirement: Corner checkbox selects
Each photo card SHALL have a select checkbox in its top-start corner. It SHALL be shown while the photo is selected, and while the pointer is over the card or the card has keyboard focus. Clicking it SHALL toggle whether the photo is selected, without opening the viewer. Its accessible name SHALL be in the active UI language.

#### Scenario: Select with the checkbox
- **WHEN** the user clicks the checkbox of an unselected photo
- **THEN** the photo is selected and appears in the tray, and the viewer does not open

#### Scenario: Deselect with the checkbox
- **WHEN** the user clicks the checkbox of a selected photo
- **THEN** the photo leaves the selection and the tray

### Requirement: Ctrl or Cmd click selects
Clicking a photo card with Ctrl held, or Cmd on a Mac, SHALL toggle whether the photo is selected, without opening the viewer.

#### Scenario: Ctrl-click two photos
- **WHEN** the user Ctrl-clicks two unselected photos
- **THEN** both are selected and the viewer does not open

### Requirement: Star corner stars the photo
The star button in a card's top-end corner SHALL toggle the photo's star without opening the viewer or changing the selection.

#### Scenario: Star from the grid
- **WHEN** the user clicks the star of an unstarred photo
- **THEN** the photo is starred, the viewer does not open, and the selection is unchanged

### Requirement: Cards work from the keyboard
A photo card SHALL be reachable with Tab. The key bound to Library → Open photo (Enter in every preset) on a focused card SHALL open the viewer on it, and the key bound to Library → Toggle selection (Space in `mac` and `windows`) SHALL toggle whether it is selected.

#### Scenario: Open with Enter
- **WHEN** a card has keyboard focus and the user presses Enter
- **THEN** the viewer opens on that photo

#### Scenario: Remote moves between cards
- **WHEN** the keymap is `tvBox` and the user presses the remote's arrows in the library
- **THEN** keyboard focus moves to the neighbouring card in that direction

### Requirement: Card marks a modified photo
In every skin, the card of a photo whose saved edit chain has at least one step SHALL show a modified mark over its thumbnail, in the same corner in every skin. The mark SHALL have a tooltip and an accessible name in the active UI language. A photo without saved edits SHALL have no mark. The mark SHALL follow saved edits without reloading the page.

#### Scenario: Cropped photo
- **WHEN** a photo has a saved crop
- **THEN** its card shows the modified mark, and hovering it shows a tooltip saying the photo was modified

#### Scenario: Unedited photo
- **WHEN** a photo has no saved edits
- **THEN** its card has no modified mark

#### Scenario: Edits undone
- **WHEN** the user removes every edit step of a photo and the change is saved
- **THEN** its card no longer shows the modified mark

#### Scenario: Every skin
- **WHEN** the same edited photo is shown in Classic, Compact and Fluid Glass
- **THEN** each card shows the modified mark over the thumbnail
