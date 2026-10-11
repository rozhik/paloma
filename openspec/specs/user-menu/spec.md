# user-menu Specification

## Purpose

Gives every user one place, under their avatar in the main navigation, for everything about themselves and the server: their account, Log out, and, for those allowed, administration and server settings.

## Requirements

### Requirement: Avatar in the main navigation
Every skin SHALL show a user button at the end of the main navigation, at every level. With auth on it SHALL have the logged-in user's display name as its label and show their uploaded avatar, else the face of the person they are linked with when they may see that person, else their initials. With auth off it SHALL show a generic person icon. Choosing it SHALL open the user menu.

#### Scenario: Logged-in user
- **WHEN** `anna` (display name `Anna Kovalenko`) is logged in, in any skin
- **THEN** the navigation ends with a button showing `AK` labelled `Anna Kovalenko`

#### Scenario: Avatar and linked person
- **WHEN** `ben` has uploaded an avatar, and `carol` has none and is linked with the person `Carol Avery`, whom she may see
- **THEN** `ben`'s button shows his avatar and `carol`'s shows the face of `Carol Avery`

#### Scenario: Users off
- **WHEN** auth is off
- **THEN** the navigation ends with a button with a person icon

### Requirement: User menu items
The user menu SHALL show, when auth is on, the user's display name, username and role, then these items where the level and the user's permissions allow them: My photos, when the user is linked with a person they may see and the level lets them choose a person; Account; Admin; Server settings; and, when auth is on, Log out. With auth off it SHALL offer only Server settings. All its texts SHALL be in the active UI language.

#### Scenario: Administrator
- **WHEN** `anna`, an administrator, opens the user menu at level Normal
- **THEN** it shows `Anna Kovalenko`, `anna` and `Administrator`, and offers Account, Admin, Server settings and Log out

#### Scenario: Viewer
- **WHEN** `ben`, a viewer not linked with a person, opens the user menu at level Normal
- **THEN** it offers Account and Log out only

#### Scenario: My photos
- **WHEN** `ben` is linked with the person `Ben Avery`, chooses My photos in the user menu at level Easy
- **THEN** the library shows the photos of `Ben Avery` that `ben` may see

#### Scenario: Users off
- **WHEN** auth is off and the level is Normal
- **THEN** the user menu offers Server settings only

### Requirement: Views of the user menu are not in the navigation
The Account, Admin and Server settings views SHALL be opened only from the user menu. The navigation's view list SHALL NOT include them. When one of them is open and the level or the user's permissions no longer allow it, the library SHALL be shown.

#### Scenario: Navigation list
- **WHEN** an administrator at level Developer looks at the navigation
- **THEN** it lists Library, People, Map, Collage and Settings, and the user button

#### Scenario: Level lowered while in Server settings
- **WHEN** the Server settings view is open and the user sets the level to Easy
- **THEN** the library is shown
