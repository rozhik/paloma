# Spec Delta

## MODIFIED Requirements

### Requirement: User can switch the language
The Settings view's Language section, and from the Easy level up also the top bar, SHALL offer a language switcher that lists every supported language by its own name (for example `Deutsch`, `日本語`, `Українська`) and marks the active one. Choosing a language SHALL switch the whole UI at once without reloading the page or losing the current view, selection or open dialog.

#### Scenario: Switch while photos are selected
- **WHEN** the UI is in English, two photos are in the tray, and the user chooses `Українська` in the top bar
- **THEN** the UI is in Ukrainian and the same two photos are still in the tray

#### Scenario: Native names
- **WHEN** the user opens the language switcher in any language
- **THEN** it lists `English`, `简体中文`, `Español`, `العربية`, `Português (Brasil)`, `Français`, `Deutsch`, `日本語`, `Русский`, `Bahasa Indonesia` and `Українська`

#### Scenario: Switch in Settings
- **WHEN** the user chooses `Deutsch` in the Settings view's Language section
- **THEN** the UI, including the Settings view, is in German at once

#### Scenario: Child level
- **WHEN** the level is Child
- **THEN** the top bar has no language switcher, and the language can be changed only in the unlocked Settings view
