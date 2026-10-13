# Spec Delta

## MODIFIED Requirements

### Requirement: Info button opens the panel
The viewer's navigation bar SHALL have an Info button that opens and closes the Info panel for the photo shown, and shows whether the panel is open. The key bound to Viewer → Info panel in the user's keymap (`i` in the `mac` and `windows` presets) SHALL do the same. The panel SHALL start closed each time the viewer opens.

#### Scenario: Open the panel
- **WHEN** the user opens a photo and chooses Info
- **THEN** the Info panel for that photo is shown and the Info button appears pressed

#### Scenario: Close with Esc
- **WHEN** the Info panel is open and the user presses Esc
- **THEN** the panel closes and the viewer stays open

#### Scenario: Rebound key
- **WHEN** the user has bound Viewer → Info panel to `D` instead of `i`
- **THEN** `D` opens and closes the panel and `i` does nothing
