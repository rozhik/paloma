# Spec Delta

## MODIFIED Requirements

### Requirement: Plugins contribute filters
A plugin's module SHALL be able to contribute image filters. Each filter SHALL have a name, a label (a string or an object of language tags to strings that includes `en`), a group (`basic`, `tuning` or `effects`), a list of parameters and optionally an icon, which is the path of an SVG file inside the plugin's folder. Each parameter SHALL have a name, a label, a type (`number` with minimum, maximum, step and default, `boolean` with default, `choice` with options and default, or `rect` with default) and SHALL be described in terms that do not depend on image resolution.

#### Scenario: Filter listed with its parameters
- **WHEN** the enabled plugin `film-grain` contributes the filter `grain` in group `effects` with a number parameter `amount` from 0 to 100, step 1, default 20
- **THEN** the plugin list shows `grain` with that group and parameter

#### Scenario: Filter with an icon
- **WHEN** the enabled plugin `film-grain` declares the icon `icons/grain.svg` for `grain`, and that file exists in its folder
- **THEN** the edit bar shows that icon for `grain`

### Requirement: Plugins API
`GET /api/plugins` SHALL return every listed plugin with its id, name and description in the requested language, version, source (`bundled` or `external`), whether it is on, status (`active`, `off` or `error`), error and warning messages, and, when active, its filters with their labels in the requested language and, for a filter with a usable icon, the URL of that icon. `PATCH /api/plugins/:id` with `{"enabled": true|false}` SHALL switch the plugin and respond with it. Switching an unknown plugin SHALL fail with 404, switching a plugin in `error` status because of its manifest, id or API version SHALL fail with 409, and an invalid body SHALL be rejected with 400.

#### Scenario: Switch a plugin off through the API
- **WHEN** a client sends `PATCH /api/plugins/basic-effects` with `{"enabled": false}`
- **THEN** the response shows `basic-effects` as off with status `off`, and `GET /api/plugins` shows the same

#### Scenario: Invalid body
- **WHEN** a client sends `PATCH /api/plugins/basic-effects` with `{"enabled": "no"}`
- **THEN** the server responds 400 and the plugin stays on

#### Scenario: Unknown plugin
- **WHEN** a client sends `PATCH /api/plugins/nope` with `{"enabled": true}`
- **THEN** the server responds 404

#### Scenario: Icon URL
- **WHEN** a client requests `GET /api/plugins` and `basic-effects` is active with an icon for `sepia`
- **THEN** the `sepia` filter has an icon URL, and requesting that URL returns the SVG image

## ADDED Requirements

### Requirement: Filter icons stay inside the plugin folder
Paloma SHALL serve a filter's icon only if it is an `.svg` file inside its plugin's folder and the plugin is active. An icon path that leads outside the plugin folder, or a file that is missing or not `.svg`, SHALL NOT be served. Such a filter SHALL have no icon URL, the plugin SHALL show a warning naming the filter, and the edit bar SHALL show a generic filter icon for it. The filter SHALL still work.

#### Scenario: Path outside the plugin
- **WHEN** an enabled plugin declares the icon `../../secret.svg` for its filter `grain`
- **THEN** `grain` has no icon URL, the plugin shows a warning naming `grain`, and the edit bar shows `grain` with the generic icon

#### Scenario: Missing icon file
- **WHEN** an enabled plugin declares `icons/grain.svg` and the file does not exist
- **THEN** `grain` is offered with the generic icon and works as before
