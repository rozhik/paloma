# Spec Delta

## MODIFIED Requirements

### Requirement: Cards work from the keyboard
A photo card SHALL be reachable with Tab. The key bound to Library → Open photo (Enter in every preset) on a focused card SHALL open the viewer on it, and the key bound to Library → Toggle selection (Space in `mac` and `windows`) SHALL toggle whether it is selected.

#### Scenario: Open with Enter
- **WHEN** a card has keyboard focus and the user presses Enter
- **THEN** the viewer opens on that photo

#### Scenario: Remote moves between cards
- **WHEN** the keymap is `tvBox` and the user presses the remote's arrows in the library
- **THEN** keyboard focus moves to the neighbouring card in that direction
