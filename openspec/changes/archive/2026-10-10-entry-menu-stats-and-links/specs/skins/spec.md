## MODIFIED Requirements

### Requirement: Every skin offers the same features
Every skin SHALL give access to every view and action that the Classic skin offers: library, people, map, collage and settings views; folder and album navigation; the sidebar entry menus and the Information dialog; search; selecting, starring and opening photos; the photo tray and its actions; and the photo viewer with its navigation and editing. A skin SHALL NOT change what an action does, only how it is presented.

#### Scenario: Export from Compact
- **WHEN** the user selects photos in the Compact skin
- **THEN** the tray actions, including Export, are available and do the same as in Classic

#### Scenario: Icon-only buttons are labelled
- **WHEN** a skin shows a button as an icon without visible text
- **THEN** the button has a tooltip and an accessible name in the active UI language

#### Scenario: Entry menu in Fluid Glass
- **WHEN** the user opens the sidebar panel in the Fluid Glass skin
- **THEN** every album entry has a menu button of at least 44 by 44 CSS pixels that offers the same items as in Classic

### Requirement: Classic skin
The Classic skin SHALL keep Paloma's current arrangement: a navigation bar across the top with labelled view buttons and search, without a language choice; the folder and album sidebar on the left; the photo tray along the bottom; and large text and controls.

#### Scenario: Classic layout
- **WHEN** the library is shown in the Classic skin
- **THEN** the navigation bar is on top with text labels on its buttons, the sidebar is at the side and the tray is at the bottom
