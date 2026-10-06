# Spec Delta

## MODIFIED Requirements

### Requirement: Navigation bar
The viewer SHALL show a navigation bar with Close, Previous and Next buttons, the photo's file name, its position in the list ("3 / 120"), the zoom buttons and percentage, and, when the level allows it, the Info button described in the photo-info capability. Each button SHALL have a tooltip and an accessible name in the active UI language.

#### Scenario: Bar contents
- **WHEN** the user opens the third of 120 photos, `IMG_0042.JPG`
- **THEN** the navigation bar shows Close, Previous, Next, `IMG_0042.JPG` and `3 / 120`

#### Scenario: Info button
- **WHEN** the level is Normal and the user opens a photo
- **THEN** the navigation bar also shows the Info button

### Requirement: Viewer keyboard
In the viewer, Esc SHALL close the viewer, `←` and `→` SHALL go to the previous and next photo, and `i` SHALL open or close the Info panel when the level allows it. In a right-to-left UI language, `←` SHALL go to the next photo and `→` to the previous one, and the Previous and Next icons SHALL be mirrored. Keys typed into a text or slider control SHALL go to that control. While a floating panel, the Info panel or a frame is open, Esc SHALL close it instead of the viewer.

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
