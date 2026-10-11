## MODIFIED Requirements

### Requirement: Settings view
The library navbar SHALL offer a Settings button that opens a Settings view at every level. All its texts SHALL be in the active UI language. The Settings view SHALL hold only the settings remembered in this browser: the first section SHALL be Language and the second Level, followed by the appearance and the viewer bar positions. Account, server and administration settings SHALL NOT be in the Settings view; they are reached from the user menu. At the Child level the Settings view SHALL open only after the PIN is entered.

#### Scenario: Open settings
- **WHEN** the user clicks Settings in the navbar
- **THEN** the Settings view is shown with the Language section first, the Level section second, and the viewer bar positions after them

#### Scenario: Only this browser's settings
- **WHEN** auth is on, an administrator at level Developer opens Settings
- **THEN** the Settings view has no Account, Plugins, server or user sections

#### Scenario: Plugins last
- **WHEN** the level is Normal and the user opens Settings
- **THEN** the Settings view has no Plugins section; plugins are in the Server settings view

#### Scenario: Open settings at Child
- **WHEN** the level is Child and the user clicks Settings
- **THEN** the PIN is asked before the Settings view is shown
