# Spec Delta

## MODIFIED Requirements

### Requirement: Slideshow keyboard
In the slideshow, the keys bound in the user's keymap SHALL toggle Play/Pause, go to the previous and next photo, and exit. In the `mac` and `windows` presets these SHALL be Space, `←`, `→` and Esc. In a right-to-left UI language `←` and `→` SHALL be swapped.

#### Scenario: Right-to-left
- **WHEN** the UI language is Arabic and the user presses `←`
- **THEN** the next photo is shown

#### Scenario: Remote control
- **WHEN** the keymap is `tvBox` and the remote's play/pause button is pressed
- **THEN** the slideshow pauses, and pressing it again plays it
