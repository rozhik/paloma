## MODIFIED Requirements

### Requirement: User can switch the language
The Settings view's Language section SHALL offer a language switcher that lists every supported language by its own name (for example `Deutsch`, `日本語`, `Українська`) and marks the active one. The top bar SHALL NOT offer a language switcher in any skin or at any level. Choosing a language SHALL switch the whole UI at once without reloading the page or losing the current view, selection or open dialog.

#### Scenario: Switch while photos are selected
- **WHEN** the UI is in English, two photos are in the tray, and the user chooses `Українська` in the Settings view's Language section and goes back to the library
- **THEN** the UI is in Ukrainian and the same two photos are still in the tray

#### Scenario: Native names
- **WHEN** the user opens the language switcher in any language
- **THEN** it lists `English`, `简体中文`, `Español`, `العربية`, `Português (Brasil)`, `Français`, `Deutsch`, `日本語`, `Русский`, `Bahasa Indonesia` and `Українська`

#### Scenario: Switch in Settings
- **WHEN** the user chooses `Deutsch` in the Settings view's Language section
- **THEN** the UI, including the Settings view, is in German at once

#### Scenario: No switcher in the top bar
- **WHEN** the library is shown at any level in any skin
- **THEN** the top bar has no language switcher

#### Scenario: Child level
- **WHEN** the level is Child
- **THEN** the language can be changed only in the unlocked Settings view
