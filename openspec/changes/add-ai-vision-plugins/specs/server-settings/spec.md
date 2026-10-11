## MODIFIED Requirements

### Requirement: Server settings view
The user menu SHALL offer a Server settings view from the Normal level up to users whose role has `plugins.manage`, and, with auth off, to the single user. It SHALL have a Server section, the Plugins section and the AI section. All its texts SHALL be in the active UI language.

#### Scenario: Administrator opens Server settings
- **WHEN** `anna`, an administrator at level Normal, chooses Server settings in the user menu
- **THEN** the Server settings view shows the Server section, the Plugins section and the AI section

#### Scenario: Editor has no Server settings
- **WHEN** an editor opens the user menu at level Developer
- **THEN** it has no Server settings item
