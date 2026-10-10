# app-settings Specification

## Purpose

Defines the Settings view and the UI preferences it holds, which are remembered per browser. The first preferences are where the photo viewer's navigation bar and edit bar are placed.

## Requirements

### Requirement: Settings view
The library navbar SHALL offer a Settings button that opens a Settings view at every level. All its texts SHALL be in the active UI language. The first section SHALL be Language and the second Level; the other sections, including the viewer bar positions, SHALL follow them, and the Plugins section, where the level shows it, SHALL be last. At the Child level the Settings view SHALL open only after the PIN is entered.

#### Scenario: Open settings
- **WHEN** the user clicks Settings in the navbar
- **THEN** the Settings view is shown with the Language section first, the Level section second, and the viewer bar positions after them

#### Scenario: Plugins last
- **WHEN** the level is Normal and the user opens Settings
- **THEN** the Plugins section is the last section of the Settings view

#### Scenario: Open settings at Child
- **WHEN** the level is Child and the user clicks Settings
- **THEN** the PIN is asked before the Settings view is shown

### Requirement: Viewer bar positions
The Settings view SHALL let the user choose, separately for the viewer's navigation bar and its edit bar, one of top, bottom, left or right. The defaults SHALL be top for the navigation bar and left for the edit bar. A change SHALL take effect the next time a photo is shown in the viewer, without reloading the page.

#### Scenario: Move the edit bar
- **WHEN** the user sets the edit bar to right in Settings and then opens a photo
- **THEN** the edit bar is along the right edge of the viewer

#### Scenario: Same edge for both
- **WHEN** the user sets both bars to bottom
- **THEN** the setting is accepted

### Requirement: Settings are remembered in this browser
UI settings SHALL be kept in the browser they were chosen in, and SHALL apply after the page is reloaded or the browser is restarted. They SHALL NOT be sent to the server or written to the photo folders. If the browser cannot store them, or a stored value is not valid, Paloma SHALL use the defaults for that value and keep working.

#### Scenario: Survives reload
- **WHEN** the user sets the navigation bar to bottom and reloads the page
- **THEN** Settings shows bottom for the navigation bar, and the viewer puts it at the bottom

#### Scenario: Another browser
- **WHEN** the user opens Paloma in a different browser
- **THEN** that browser uses the default positions

#### Scenario: Invalid stored value
- **WHEN** the stored navigation bar position is `middle`
- **THEN** the navigation bar is placed on top, and the other settings are kept
