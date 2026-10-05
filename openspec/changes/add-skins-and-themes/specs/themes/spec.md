# Spec Delta

## Purpose

Defines themes: color schemes that are independent of the skin, how the user chooses one or lets Paloma follow the operating system, and the built-in Light, Dark and High Contrast themes with their contrast guarantees.

## ADDED Requirements

### Requirement: Built-in themes
Paloma SHALL offer exactly these themes: Light, Dark and High Contrast. The theme choice SHALL also offer System, which follows the operating system. Names and descriptions SHALL be shown in the active UI language.

#### Scenario: Themes listed in Settings
- **WHEN** the user opens the Appearance section of the Settings view
- **THEN** System, Light, Dark and High Contrast are offered as theme choices

### Requirement: A theme defines colors only
A theme SHALL change only colors. Changing the theme SHALL NOT change layout, structure, element sizes or fonts.

#### Scenario: Same layout in another theme
- **WHEN** the user switches from Light to Dark in the Compact skin
- **THEN** every element keeps its position and size, and only colors change

### Requirement: Any theme with any skin
Every theme SHALL work with every skin. Colors the theme does not set SHALL come from the skin's default colors.

#### Scenario: All combinations
- **WHEN** each of the three skins is combined with each of the three themes
- **THEN** all nine combinations show the whole UI in that theme's colors, with readable text

### Requirement: Choosing a theme
The Settings view SHALL let the user choose the theme. The chosen theme SHALL apply at once to the whole UI, including views that are open and the photo viewer, without reloading the page.

#### Scenario: Switch to Dark
- **WHEN** the user chooses Dark in Settings
- **THEN** the Settings view, and every view opened after it, is shown in dark colors at once

### Requirement: System theme follows the operating system
When the theme choice is System, Paloma SHALL use High Contrast if the operating system asks for more contrast, otherwise Dark if it uses a dark appearance, otherwise Light. When the operating system setting changes while Paloma is open, the theme SHALL follow without a reload.

#### Scenario: Dark appearance
- **WHEN** the theme choice is System and the operating system uses a dark appearance
- **THEN** the Dark theme is used

#### Scenario: Increased contrast wins
- **WHEN** the theme choice is System and the operating system uses a dark appearance and asks for more contrast
- **THEN** the High Contrast theme is used

#### Scenario: OS changes while open
- **WHEN** the theme choice is System and the operating system switches from light to dark appearance
- **THEN** Paloma switches from Light to Dark without a reload

#### Scenario: Explicit choice ignores the OS
- **WHEN** the theme choice is Light and the operating system uses a dark appearance
- **THEN** the Light theme is used

### Requirement: Default theme
When no theme has been chosen in this browser, or the remembered theme is not one of the offered choices, the theme choice SHALL be System.

#### Scenario: First launch
- **WHEN** Paloma is opened for the first time in a browser whose operating system uses a light appearance
- **THEN** the theme choice is System and the Light theme is used

#### Scenario: Unknown remembered theme
- **WHEN** the remembered theme is `sepia`
- **THEN** the theme choice is System and the remembered skin is kept

### Requirement: Theme is remembered in this browser
The theme choice SHALL be kept in the browser it was chosen in and SHALL apply after a reload or browser restart. It SHALL NOT be sent to the server or written to the photo folders.

#### Scenario: Survives reload
- **WHEN** the user chooses High Contrast and reloads the page
- **THEN** the UI opens in High Contrast

### Requirement: Readable contrast
In the Light and Dark themes, normal text SHALL have a contrast ratio of at least 4.5:1 against its background, and icons, control borders and the keyboard focus indicator at least 3:1. In the High Contrast theme, text SHALL have at least 7:1, icons, control borders and the focus indicator at least 4.5:1, and no surface SHALL be translucent.

#### Scenario: High Contrast text
- **WHEN** the High Contrast theme is active
- **THEN** every text color measures at least 7:1 against the background it is shown on

#### Scenario: Focus is visible
- **WHEN** the user moves keyboard focus to a button in any theme
- **THEN** the focus indicator measures at least the contrast required by that theme against its surroundings

### Requirement: Photos are not recolored
A theme SHALL NOT change how photos, thumbnails, edit previews or map tiles are drawn; only the UI around them changes color.

#### Scenario: Photo in Dark
- **WHEN** the same photo is viewed in Light and in Dark
- **THEN** the photo's pixels look identical; only the viewer background and controls differ

### Requirement: Browser controls follow the theme
The browser's own controls and scrollbars SHALL use dark styling when the active theme is Dark, and light styling when it is Light.

#### Scenario: Scrollbars in Dark
- **WHEN** the Dark theme is active and the library grid is scrolled
- **THEN** the scrollbar is drawn in the browser's dark style
