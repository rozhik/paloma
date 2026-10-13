# Spec Delta

## MODIFIED Requirements

### Requirement: User menu items
The user menu SHALL show, when auth is on, the user's display name, username and role, then these items where the level and the user's permissions allow them: My photos, when the user is linked with a person they may see and the level lets them choose a person; Account; Tasks; Admin; Server settings; and, when auth is on, Log out. With auth off it SHALL offer only Tasks and Server settings. All its texts SHALL be in the active UI language.

#### Scenario: Administrator
- **WHEN** `anna`, an administrator, opens the user menu at level Normal
- **THEN** it shows `Anna Kovalenko`, `anna` and `Administrator`, and offers Account, Tasks, Admin, Server settings and Log out

#### Scenario: Viewer
- **WHEN** `ben`, a viewer not linked with a person, opens the user menu at level Normal
- **THEN** it offers Account, Tasks and Log out only

#### Scenario: My photos
- **WHEN** `ben` is linked with the person `Ben Avery`, chooses My photos in the user menu at level Easy
- **THEN** the library shows the photos of `Ben Avery` that `ben` may see

#### Scenario: Users off
- **WHEN** auth is off and the level is Normal
- **THEN** the user menu offers Tasks and Server settings only

### Requirement: Views of the user menu are not in the navigation
The Account, Tasks, Admin and Server settings views SHALL be opened only from the user menu. The navigation's view list SHALL NOT include them. When one of them is open and the level or the user's permissions no longer allow it, the library SHALL be shown.

#### Scenario: Navigation list
- **WHEN** an administrator at level Developer looks at the navigation
- **THEN** it lists Library, People, Map, Collage and Settings, and the user button

#### Scenario: Level lowered while in Server settings
- **WHEN** the Server settings view is open and the user sets the level to Easy
- **THEN** the library is shown
