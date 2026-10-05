# Spec Delta

## MODIFIED Requirements

### Requirement: Settings view
The library navbar SHALL offer a Settings button that opens a Settings view at every level. All its texts SHALL be in the active UI language. The first section SHALL be Language and the second Level; the other sections, including the viewer bar positions, SHALL follow them. At the Child level the Settings view SHALL open only after the PIN is entered.

#### Scenario: Open settings
- **WHEN** the user clicks Settings in the navbar
- **THEN** the Settings view is shown with the Language section first, the Level section second, and the viewer bar positions after them

#### Scenario: Open settings at Child
- **WHEN** the level is Child and the user clicks Settings
- **THEN** the PIN is asked before the Settings view is shown
