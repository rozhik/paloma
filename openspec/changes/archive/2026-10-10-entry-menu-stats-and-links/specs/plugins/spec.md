## ADDED Requirements

### Requirement: Plugins section in Settings
The Settings view SHALL have a Plugins section, shown from the Normal level up, that lists every plugin with its name, description, version, whether it is bundled or external, a switch to turn it on or off, and any error or warning. The section SHALL say that external plugins run with full access to the computer. If switching fails, the section SHALL show the error in the active language and keep the previous state. The top bar SHALL NOT offer a Plugins view.

#### Scenario: Switch on in Settings
- **WHEN** the user opens Settings and switches on an external plugin in the Plugins section
- **THEN** the switch shows it as on, and its filters appear in the editor

#### Scenario: Plugin with an error
- **WHEN** a plugin failed to load
- **THEN** the Plugins section shows its error message

#### Scenario: No Plugins button in the top bar
- **WHEN** the level is Developer and the library is shown in any skin
- **THEN** the top bar has no Plugins button

## REMOVED Requirements

### Requirement: Plugins view
**Reason**: Plugins are rarely managed; a separate top-bar view crowds the navigation. The same list moves into Settings.
**Migration**: Use the Plugins section of the Settings view (see "Plugins section in Settings").
