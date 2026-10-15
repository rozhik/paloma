# Spec Delta

## MODIFIED Requirements

### Requirement: Photo opens fitted to the screen
When the viewer opens a photo, and when it moves to another photo, the photo SHALL be shown centred at the zoom level chosen in Settings as "Open photos at": Fit, Fill or Original size, Fit by default. At Fit the photo SHALL be shown whole, as large as fits in the window, and a photo smaller than the window SHALL be shown at its actual size. When the window is resized while the photo is at Fit or Fill, it SHALL stay at that level.

#### Scenario: Small photo
- **WHEN** "Open photos at" is Fit and the user opens a 640×480 photo in a 1600×900 window
- **THEN** the photo is shown at 640×480, centred

#### Scenario: Open at original size
- **WHEN** "Open photos at" is Original size and the user opens a 4000×3000 photo in a 1600×900 window
- **THEN** the photo is shown at 100%, centred, and can be panned

#### Scenario: Next photo at the chosen level
- **WHEN** "Open photos at" is Fill, the user zooms the photo to 300% and chooses Next
- **THEN** the next photo is shown at Fill

### Requirement: Viewer keyboard
In the viewer, the keys bound in the user's keymap SHALL close the viewer, go to the previous and next photo, open or close the Info panel, turn face frames on or off, zoom, zoom to 100% and undo, each when the level allows it. In the `mac` and `windows` presets these SHALL be Esc, `←`, `→`, `i`, `f`, `+`, `-`, `0`, `1`, and `Meta+Z` or `Ctrl+Z`. In a right-to-left UI language `←` and `→` SHALL be swapped and the Previous and Next icons mirrored. Keys typed into a text or slider control SHALL go to that control. While a floating panel, the Info panel or a frame is open, Esc SHALL close it instead of the viewer.

#### Scenario: Arrow keys
- **WHEN** the UI language is English and the user presses `→`
- **THEN** the viewer shows the next photo

#### Scenario: Right-to-left
- **WHEN** the UI language is Arabic and the user presses `←`
- **THEN** the viewer shows the next photo

#### Scenario: Esc with an open panel
- **WHEN** the brightness panel is open and the user presses Esc
- **THEN** the panel closes and the viewer stays open

#### Scenario: Typing a tag
- **WHEN** the Info panel is open and the user types `i` into its tag field
- **THEN** the letter goes into the field and the panel stays open

#### Scenario: Faces key
- **WHEN** the level is Easy and the user presses `f`
- **THEN** face frames turn on, and pressing `f` again turns them off

#### Scenario: Typing f
- **WHEN** the Info panel is open and the user types `f` into its tag field
- **THEN** the letter goes into the field and face frames do not change

#### Scenario: Rebound next
- **WHEN** the user has bound Viewer → Next photo to `N` only
- **THEN** `N` shows the next photo and `→` does nothing

#### Scenario: Actual size key
- **WHEN** the keymap is `windows`, a 4000×3000 photo is fitted and the user presses `1`
- **THEN** the photo is shown at 100%, keeping the centre of the window in place

## ADDED Requirements

### Requirement: Zoom levels
Choosing the zoom percentage in the navigation bar SHALL open a menu of zoom levels: Fit, Fill, 50%, 100% (Original size), 200% and 400%, with names in the active UI language and the current level marked. Fit SHALL be as described in Photo opens fitted to the screen; Fill SHALL cover the whole window with the photo, centred, up to 400%. Percentages SHALL keep the centre of the window in place. A level below Fit SHALL be disabled.

#### Scenario: Choose 100%
- **WHEN** a 4000×3000 photo is fitted and the user chooses 100% in the zoom menu
- **THEN** the photo is shown at 100% with the photo point at the centre of the window kept in place, and the bar shows 100%

#### Scenario: Fill
- **WHEN** the user chooses Fill for a 4000×3000 photo in a 1600×900 window
- **THEN** the photo is shown 1600×1200, centred, and can be panned up and down

#### Scenario: Level below fit
- **WHEN** a 4000×3000 photo fits a 1600×900 window at 30%
- **THEN** 50% is enabled, and for a 1000×750 photo, fitted at 100%, 50% is disabled

#### Scenario: Current level marked
- **WHEN** the photo is at Fill and the user opens the zoom menu
- **THEN** Fill is marked as the current level
