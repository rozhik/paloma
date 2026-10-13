# Spec Delta

## MODIFIED Requirements

### Requirement: Settings view
The library navbar SHALL offer a Settings button that opens a Settings view at every level. All its texts SHALL be in the active UI language. The Settings view SHALL hold the settings remembered in this browser and, from the Normal level, the Keyboard section, which is kept on the server: the first section SHALL be Language and the second Level, followed by the appearance, the viewer bar positions and Keyboard. Account, server and administration settings SHALL NOT be in the Settings view; they are reached from the user menu. At the Child level the Settings view SHALL open only after the PIN is entered.

#### Scenario: Open settings
- **WHEN** the user clicks Settings in the navbar
- **THEN** the Settings view is shown with the Language section first, the Level section second, and the viewer bar positions after them

#### Scenario: Only this browser's settings
- **WHEN** auth is on, an administrator at level Developer opens Settings
- **THEN** the Settings view has a Keyboard section and no Account, Plugins, server or user sections

#### Scenario: Plugins last
- **WHEN** the level is Normal and the user opens Settings
- **THEN** the Settings view has no Plugins section; plugins are in the Server settings view

#### Scenario: Open settings at Child
- **WHEN** the level is Child and the user clicks Settings
- **THEN** the PIN is asked before the Settings view is shown

#### Scenario: Keyboard section last
- **WHEN** the level is Normal and the user opens Settings
- **THEN** the Keyboard section comes after the viewer bar positions

### Requirement: Settings are remembered in this browser
UI settings other than the keymap SHALL be kept in the browser they were chosen in, and SHALL apply after the page is reloaded or the browser is restarted. They SHALL NOT be sent to the server or written to the photo folders. If the browser cannot store them, or a stored value is not valid, Paloma SHALL use the defaults for that value and keep working. The keymap SHALL be kept on the server as described in the keybindings capability.

#### Scenario: Survives reload
- **WHEN** the user sets the navigation bar to bottom and reloads the page
- **THEN** Settings shows bottom for the navigation bar, and the viewer puts it at the bottom

#### Scenario: Another browser
- **WHEN** the user opens Paloma in a different browser
- **THEN** that browser uses the default positions

#### Scenario: Invalid stored value
- **WHEN** the stored navigation bar position is `middle`
- **THEN** the navigation bar is placed on top, and the other settings are kept

#### Scenario: Keymap follows the user
- **WHEN** the user chooses the `tvBox` keymap and opens Paloma in a different browser
- **THEN** that browser uses `tvBox`, while its viewer bar positions are the defaults
