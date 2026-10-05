# skins Specification

## Purpose

Defines skins: interchangeable ways the Paloma UI is built and laid out (its structure, element sizes, fonts and default colors), how the user chooses one, the behavior every skin keeps, and the built-in Classic, Compact and Fluid Glass skins.

## Requirements

### Requirement: Built-in skins
Paloma SHALL offer exactly these skins: Classic, Compact and Fluid Glass. Their names and descriptions SHALL be shown in the active UI language.

#### Scenario: Skins listed in Settings
- **WHEN** the user opens the Appearance section of the Settings view
- **THEN** Classic, Compact and Fluid Glass are offered as skins, each with a short description

### Requirement: Choosing a skin
The Settings view SHALL let the user choose the skin. The chosen skin SHALL apply at once to the whole UI, without reloading the page, and the current view, the selected folder or album and the photo selection SHALL be kept.

#### Scenario: Switch skin
- **WHEN** the user has three photos selected in a folder and chooses Compact
- **THEN** the UI is shown in the Compact skin, the same folder is shown and the same three photos are still selected

### Requirement: Default skin
When no skin has been chosen in this browser, or the remembered skin is not one of the built-in skins, Paloma SHALL use the Classic skin.

#### Scenario: First launch
- **WHEN** Paloma is opened for the first time in a browser
- **THEN** the Classic skin is used

#### Scenario: Unknown remembered skin
- **WHEN** the remembered skin is `neon`
- **THEN** the Classic skin is used and the remembered theme and other UI settings are kept

### Requirement: Skin is remembered in this browser
The chosen skin SHALL be kept in the browser it was chosen in and SHALL apply after a reload or browser restart. It SHALL NOT be sent to the server or written to the photo folders.

#### Scenario: Survives reload
- **WHEN** the user chooses Fluid Glass and reloads the page
- **THEN** the UI opens in the Fluid Glass skin

#### Scenario: Another browser
- **WHEN** the user opens Paloma in a different browser
- **THEN** that browser uses the Classic skin

### Requirement: No flash of another skin
On page load, the remembered skin and theme SHALL be in place before the UI is first shown.

#### Scenario: Reload in Compact
- **WHEN** the user reloads the page with the Compact skin and Dark theme remembered
- **THEN** the first UI the user sees is Compact and Dark, not Classic or Light for a moment

### Requirement: A skin defines structure, sizes, fonts and default colors
A skin SHALL define the layout and structure of the app shell (navigation, folder sidebar and photo tray), the library grid with its photo cards, and the photo viewer's bars; and the element sizes and fonts of the whole UI. A skin's structure MAY differ completely from another skin's, not only in styling. A skin SHALL also define default colors that apply wherever the theme does not set a color.

#### Scenario: Different structure
- **WHEN** the same library is shown in Classic and in Fluid Glass
- **THEN** the navigation, sidebar and tray are arranged differently, not just recolored

#### Scenario: Shared views follow the skin
- **WHEN** the map view is opened in the Compact skin
- **THEN** its text and controls use the Compact skin's sizes and fonts

### Requirement: Every skin offers the same features
Every skin SHALL give access to every view and action that the Classic skin offers: library, people, map, collage, plugins and settings views; folder and album navigation; search; selecting, starring and opening photos; the photo tray and its actions; and the photo viewer with its navigation and editing. A skin SHALL NOT change what an action does, only how it is presented.

#### Scenario: Export from Compact
- **WHEN** the user selects photos in the Compact skin
- **THEN** the tray actions, including Export, are available and do the same as in Classic

#### Scenario: Icon-only buttons are labelled
- **WHEN** a skin shows a button as an icon without visible text
- **THEN** the button has a tooltip and an accessible name in the active UI language

### Requirement: Every skin follows the viewer bar settings
In every skin, the photo viewer's navigation bar and edit bar SHALL be placed on the screen edges chosen in Settings. A skin MAY change how the bars look and their thickness.

#### Scenario: Edit bar on the right in Fluid Glass
- **WHEN** the edit bar is set to right and a photo is opened in the Fluid Glass skin
- **THEN** the edit bar is along the right edge of the viewer

### Requirement: Every skin supports right-to-left languages
In every skin, a right-to-left UI language SHALL mirror the layout in the same way as in the Classic skin.

#### Scenario: Arabic in Compact
- **WHEN** the active language is Arabic and the skin is Compact
- **THEN** the sidebar and the reading order of the navigation are mirrored

### Requirement: Sidebar lists are collapsible
In every skin, each list in the sidebar (the library shortcuts, Albums, Folders, and any list added later) SHALL be collapsible and expandable on its own by clicking or tapping its heading. Lists SHALL start expanded. Collapsing a list SHALL NOT change the selected folder, album or shortcut. Which lists are collapsed SHALL be remembered in this browser and apply in every skin.

#### Scenario: Collapse Albums
- **WHEN** the user collapses the Albums list
- **THEN** the album entries are hidden, the Albums heading stays visible, and the Folders list moves up

#### Scenario: Selection kept while collapsed
- **WHEN** a folder is selected and the user collapses the Folders list
- **THEN** the same folder's photos are still shown in the grid

#### Scenario: Remembered across reload and skins
- **WHEN** the user collapses Folders, switches to the Compact skin and reloads the page
- **THEN** the Folders list is still collapsed and Albums is still expanded

#### Scenario: Keyboard and screen readers
- **WHEN** the user moves keyboard focus to a list heading and presses Enter or Space
- **THEN** the list collapses or expands, and the heading reports whether it is expanded in the active UI language

### Requirement: Classic skin
The Classic skin SHALL keep Paloma's current arrangement: a navigation bar across the top with labelled view buttons, search and language choice; the folder and album sidebar on the left; the photo tray along the bottom; and large text and controls.

#### Scenario: Classic layout
- **WHEN** the library is shown in the Classic skin
- **THEN** the navigation bar is on top with text labels on its buttons, the sidebar is at the side and the tray is at the bottom

### Requirement: Compact skin
The Compact skin SHALL fit more on the screen than Classic: smaller text, smaller thumbnails, navigation buttons as icons, a folder sidebar that can be collapsed to a narrow strip, and a thinner photo tray and viewer bars. Interactive targets SHALL stay at least 24 by 24 CSS pixels.

#### Scenario: More photos per screen
- **WHEN** the same folder is shown in the same window size in Classic and in Compact
- **THEN** Compact shows more photo thumbnails at once

#### Scenario: Collapse the sidebar
- **WHEN** the user collapses the sidebar in the Compact skin
- **THEN** the sidebar becomes a narrow strip, the grid widens, and the sidebar can be expanded again

#### Scenario: Collapsed sidebar is remembered
- **WHEN** the user collapses the sidebar and reloads the page
- **THEN** the sidebar is still collapsed

### Requirement: Fluid Glass skin
The Fluid Glass skin SHALL be built for touch: photos fill the content area edge to edge and scroll under floating, translucent toolbars and panels with rounded corners; the sidebar opens as a floating panel over the content, with its lists collapsible as in every skin; and every interactive target SHALL be at least 44 by 44 CSS pixels.

#### Scenario: Content under the glass
- **WHEN** the user scrolls the library in the Fluid Glass skin
- **THEN** the thumbnails move under the floating toolbars and stay faintly visible through them

#### Scenario: Touch targets
- **WHEN** any button in the Fluid Glass skin is measured
- **THEN** it is at least 44 by 44 CSS pixels

#### Scenario: Sidebar as a panel
- **WHEN** the user opens the folders in the Fluid Glass skin
- **THEN** the folder sidebar appears as a floating panel over the grid and closes when a folder is chosen or the user taps outside it

### Requirement: Glass falls back to solid surfaces
In the Fluid Glass skin, toolbars and panels SHALL be shown as solid, not translucent, when the browser cannot blur the content behind them, when the operating system asks for reduced transparency, or when the High Contrast theme is active. Text on them SHALL remain readable in every case.

#### Scenario: Reduced transparency
- **WHEN** the operating system is set to reduce transparency and the skin is Fluid Glass
- **THEN** the toolbars are solid and the content does not show through them

#### Scenario: High Contrast theme
- **WHEN** the skin is Fluid Glass and the theme is High Contrast
- **THEN** the toolbars and panels are solid, in the High Contrast colors
