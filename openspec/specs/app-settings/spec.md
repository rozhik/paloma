# app-settings Specification

## Purpose

Defines the Settings view and the UI preferences it holds, which are remembered per browser. The first preferences are where the photo viewer's navigation bar and edit bar are placed.

## Requirements

### Requirement: Settings view
The library navbar SHALL offer a Settings button that opens a Settings view at every level. All its texts SHALL be in the active UI language. The Settings view SHALL hold the settings remembered in this browser and, from the Normal level, the Keyboard section, which is kept on the server: the first section SHALL be Language and the second Level, followed by the appearance, the viewer settings, Slideshow and Keyboard. Account, server and administration settings SHALL NOT be in the Settings view; they are reached from the user menu. At the Child level the Settings view SHALL open only after the PIN is entered.

#### Scenario: Open settings
- **WHEN** the user clicks Settings in the navbar
- **THEN** the Settings view is shown with the Language section first, the Level section second, and the viewer settings and Slideshow after them

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
- **THEN** the Keyboard section comes after the Slideshow section

### Requirement: Viewer bar positions
The Settings view SHALL let the user choose, separately for the viewer's navigation bar and its edit bar, one of top, bottom, left or right. The defaults SHALL be top for the navigation bar and left for the edit bar. A change SHALL take effect the next time a photo is shown in the viewer, without reloading the page.

#### Scenario: Move the edit bar
- **WHEN** the user sets the edit bar to right in Settings and then opens a photo
- **THEN** the edit bar is along the right edge of the viewer

#### Scenario: Same edge for both
- **WHEN** the user sets both bars to bottom
- **THEN** the setting is accepted

### Requirement: Viewer opening zoom
The viewer settings SHALL let the user choose "Open photos at": Fit, Fill or Original size, Fit by default. A change SHALL take effect the next time a photo is shown in the viewer, without reloading the page.

#### Scenario: Choose Original size
- **WHEN** the user sets "Open photos at" to Original size and then opens a photo
- **THEN** the viewer shows the photo at 100%

### Requirement: Slideshow settings
The Settings view SHALL have a Slideshow section at every level, with the interval (3, 5 or 10 seconds), the effect (None, Random or one of the effects of the slideshow-effects capability), the effect duration (0.5, 1 or 2 seconds), shuffle (on or off) and the photo size (Fit, Fit without enlarging, Fill or Original size). The defaults SHALL be 5 seconds, Fade, 1 second, off and Fit. A change SHALL take effect in the next slideshow, without reloading the page.

#### Scenario: Defaults
- **WHEN** the user has never changed the slideshow settings and opens Settings
- **THEN** the Slideshow section shows 5 seconds, Fade, 1 second, shuffle off and Fit

#### Scenario: Same interval as the bar
- **WHEN** the user picks 10 seconds on the slideshow bar and later opens Settings
- **THEN** the Slideshow section shows 10 seconds

#### Scenario: Invalid stored effect
- **WHEN** the stored slideshow effect is `spin`
- **THEN** the slideshow uses Fade, and the other settings are kept

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
