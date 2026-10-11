## MODIFIED Requirements

### Requirement: Navigation bar
The viewer SHALL show a navigation bar with Close, Previous and Next buttons, the photo's file name, its position in the list ("3 / 120"), the zoom buttons and percentage, and, when the level allows it, the Info button described in the photo-info capability, the Faces toggle described in the people capability, and the Objects toggle described in the ai-processing capability. Each button SHALL have a tooltip and an accessible name in the active UI language.

#### Scenario: Bar contents
- **WHEN** the user opens the third of 120 photos, `IMG_0042.JPG`
- **THEN** the navigation bar shows Close, Previous, Next, `IMG_0042.JPG` and `3 / 120`

#### Scenario: Info button
- **WHEN** the level is Normal and the user opens a photo
- **THEN** the navigation bar also shows the Info button

#### Scenario: Faces toggle
- **WHEN** the level is Easy and the user opens a photo
- **THEN** the navigation bar shows the Faces toggle, pressed when face frames are on

#### Scenario: Objects toggle
- **WHEN** the level is Normal and the user opens a photo
- **THEN** the navigation bar shows the Objects toggle, pressed when object frames are on
