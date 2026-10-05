# Spec Delta

## MODIFIED Requirements

### Requirement: Plugin folder and manifest
A plugin SHALL be a folder containing `paloma-plugin.json`: a JSON object with `id` (lowercase letters, digits and hyphens), `name`, `description`, `version` (string), `apiVersion` (integer), `server` (path of a JavaScript module inside the folder) and optionally `level`, one of `child`, `easy`, `normal`, `pro` or `developer`, which defaults to `normal`. `name` and `description` SHALL be either a string or an object of language tags to strings that includes `en`.

#### Scenario: Valid manifest
- **WHEN** a plugin folder has `paloma-plugin.json` with `"id": "film-grain"`, `"name": {"en": "Film grain", "uk": "Плівкове зерно"}`, `"description": "Adds grain"`, `"version": "1.2.0"`, `"apiVersion": 1` and `"server": "index.js"`, and `index.js` exists
- **THEN** the plugin is listed with id `film-grain`, version `1.2.0`, level `normal` and its name and description

#### Scenario: Manifest with a level
- **WHEN** a plugin's manifest has `"level": "pro"`
- **THEN** the plugin is listed with level `pro`

#### Scenario: Invalid level
- **WHEN** a plugin's manifest has `"level": "expert"`
- **THEN** the plugin is listed with status `error` and a message naming the allowed levels, and its module is not loaded

#### Scenario: Invalid manifest
- **WHEN** a plugin folder's `paloma-plugin.json` has no `id` or is not valid JSON
- **THEN** the plugin is listed by its folder name with status `error` and a message naming the problem, and its module is not loaded

#### Scenario: Module path outside the folder
- **WHEN** a manifest has `"server": "../other/index.js"`
- **THEN** the plugin has status `error` and no module is loaded

### Requirement: Plugins contribute filters
A plugin's module SHALL be able to contribute image filters. Each filter SHALL have a name, a label (a string or an object of language tags to strings that includes `en`), a group (`basic`, `tuning` or `effects`), a list of parameters, optionally an icon, which is the path of an SVG file inside the plugin's folder, and optionally a level (`child`, `easy`, `normal`, `pro` or `developer`). A filter without a level SHALL have its plugin's level. Each parameter SHALL have a name, a label, a type (`number` with minimum, maximum, step and default, `boolean` with default, `choice` with options and default, or `rect` with default) and SHALL be described in terms that do not depend on image resolution.

#### Scenario: Filter listed with its parameters
- **WHEN** the enabled plugin `film-grain` contributes the filter `grain` in group `effects` with a number parameter `amount` from 0 to 100, step 1, default 20
- **THEN** the plugin list shows `grain` with that group and parameter

#### Scenario: Filter with an icon
- **WHEN** the enabled plugin `film-grain` declares the icon `icons/grain.svg` for `grain`, and that file exists in its folder
- **THEN** the edit bar shows that icon for `grain`

#### Scenario: Filter with its own level
- **WHEN** the plugin `film-grain` has level `easy` and its filter `grain` declares level `pro`
- **THEN** `grain` is listed with level `pro`

#### Scenario: Filter with an invalid level
- **WHEN** a plugin's filter `grain` declares level `expert`
- **THEN** `grain` is not available, the plugin's other filters still work, and the plugin shows a warning naming `grain`

### Requirement: Plugins API
`GET /api/plugins` SHALL return every listed plugin with its id, name and description in the requested language, version, source (`bundled` or `external`), level, whether it is on, status (`active`, `off` or `error`), error and warning messages, and, when active, its filters with their labels in the requested language, their level and, for a filter with a usable icon, the URL of that icon. `PATCH /api/plugins/:id` with `{"enabled": true|false}` SHALL switch the plugin and respond with it. Switching an unknown plugin SHALL fail with 404, switching a plugin in `error` status because of its manifest, id or API version SHALL fail with 409, and an invalid body SHALL be rejected with 400.

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

#### Scenario: Levels in the list
- **WHEN** a client requests `GET /api/plugins`
- **THEN** `basic-effects` has level `easy` and each of its filters has level `easy`, and `basic-transforms` and its filters have level `normal`
