# Spec Delta

## ADDED Requirements

### Requirement: Bundled filters have icons
Every filter of the bundled plugins (`crop64`, `rotate`, `flip`, `straighten`, `brightness`, `contrast`, `bw`, `sepia`) SHALL have its own icon, and no two of them SHALL share an icon.

#### Scenario: Default edit bar icons
- **WHEN** both bundled plugins are on and the user opens a photo in the viewer
- **THEN** each bundled filter in the edit bar has its own distinct icon, and none shows the generic filter icon

#### Scenario: Rotate step in the Changes list
- **WHEN** the user rotates right and opens "Changes"
- **THEN** the `rotate` step is listed with the rotate icon
