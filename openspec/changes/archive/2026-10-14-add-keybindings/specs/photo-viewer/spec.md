# Spec Delta

## MODIFIED Requirements

### Requirement: Viewer keyboard
In the viewer, the keys bound in the user's keymap SHALL close the viewer, go to the previous and next photo, open or close the Info panel, turn face frames on or off, zoom and undo, each when the level allows it. In the `mac` and `windows` presets these SHALL be Esc, `←`, `→`, `i`, `f`, `+`, `-`, `0`, and `Meta+Z` or `Ctrl+Z`. In a right-to-left UI language `←` and `→` SHALL be swapped and the Previous and Next icons mirrored. Keys typed into a text or slider control SHALL go to that control. While a floating panel, the Info panel or a frame is open, Esc SHALL close it instead of the viewer.

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
