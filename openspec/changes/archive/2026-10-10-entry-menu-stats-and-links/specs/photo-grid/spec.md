## ADDED Requirements

### Requirement: Card marks a modified photo
In every skin, the card of a photo whose saved edit chain has at least one step SHALL show a modified mark over its thumbnail, in the same corner in every skin. The mark SHALL have a tooltip and an accessible name in the active UI language. A photo without saved edits SHALL have no mark. The mark SHALL follow saved edits without reloading the page.

#### Scenario: Cropped photo
- **WHEN** a photo has a saved crop
- **THEN** its card shows the modified mark, and hovering it shows a tooltip saying the photo was modified

#### Scenario: Unedited photo
- **WHEN** a photo has no saved edits
- **THEN** its card has no modified mark

#### Scenario: Edits undone
- **WHEN** the user removes every edit step of a photo and the change is saved
- **THEN** its card no longer shows the modified mark

#### Scenario: Every skin
- **WHEN** the same edited photo is shown in Classic, Compact and Fluid Glass
- **THEN** each card shows the modified mark over the thumbnail
