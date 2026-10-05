# plugins Specification

## Purpose

Defines Paloma plugins: folders of trusted code with a manifest that are found at startup, can be switched on and off by the user, and contribute features (in this version, image filters) without changes to Paloma itself.

## Requirements

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

### Requirement: Plugins are found in the bundled and external folders
At startup Paloma SHALL look for plugins in each direct subfolder of the bundled `plugins/` folder shipped with Paloma, and of the external plugins folder set in `.env`. Subfolders without `paloma-plugin.json` SHALL be ignored. A missing external folder SHALL mean that there are no external plugins. Plugins added or removed while the server runs SHALL appear or disappear after a restart.

#### Scenario: Plugin installed from a git repository
- **WHEN** the user runs `git clone https://example.com/paloma-film-grain.git` inside the external plugins folder and restarts Paloma
- **THEN** the plugin from that repository is listed as an external plugin

#### Scenario: Folder without a manifest
- **WHEN** the external plugins folder contains a subfolder `notes` without `paloma-plugin.json`
- **THEN** no plugin is listed for `notes` and no error is shown

#### Scenario: External folder not set up
- **WHEN** the external plugins folder does not exist
- **THEN** Paloma starts normally and lists only the bundled plugins

### Requirement: Paloma never modifies plugin folders
Paloma SHALL NOT create, change or delete any file inside a bundled or external plugin folder.

#### Scenario: Switching a plugin
- **WHEN** the user switches an external plugin on and then off
- **THEN** no file in that plugin's folder is changed

### Requirement: Plugin ids are unique
When two plugins have the same `id`, the bundled plugin SHALL win over an external one, and between external plugins the one whose folder name sorts first SHALL win. The other SHALL be listed with status `error` and a message naming the duplicate id, and its module SHALL NOT be loaded.

#### Scenario: External plugin reuses a bundled id
- **WHEN** an external plugin declares `"id": "basic-effects"`
- **THEN** the bundled `basic-effects` works as before, and the external one is listed with status `error` naming `basic-effects`

### Requirement: Unsupported plugin API version
Paloma SHALL load only plugins whose `apiVersion` it supports, which in this version is `1`. Other plugins SHALL be listed with status `error` and a message naming the required and supported versions.

#### Scenario: Plugin built for a newer Paloma
- **WHEN** a plugin declares `"apiVersion": 2`
- **THEN** it is listed with status `error` saying it needs plugin API 2 while Paloma supports 1, and its module is not loaded

### Requirement: Plugins can be switched on and off
Each plugin that is not in `error` status SHALL be either on or off. The user's choice SHALL be kept across restarts in Paloma's data directory. A bundled plugin SHALL be on until the user switches it off. An external plugin SHALL be off until the user switches it on.

#### Scenario: Newly installed external plugin
- **WHEN** an external plugin is found for the first time
- **THEN** it is listed as off and its filters are not available

#### Scenario: Choice survives a restart
- **WHEN** the user switches off the bundled `basic-effects` plugin and restarts Paloma
- **THEN** `basic-effects` is still off

### Requirement: Code of a plugin that is off is not run
Paloma SHALL NOT load or run the module of a plugin that is off. Switching a plugin on SHALL load its module without a restart. Switching a plugin off SHALL stop its features at once, without a restart.

#### Scenario: Switch on without restart
- **WHEN** the user switches on an external plugin that provides the filter `grain`
- **THEN** `grain` is available in the editor without restarting Paloma

#### Scenario: Plugin that is off at startup
- **WHEN** Paloma starts with an external plugin switched off whose module would write a log line when loaded
- **THEN** that log line does not appear

#### Scenario: Switch off without restart
- **WHEN** the user switches off `basic-effects` while photos have `bw` steps
- **THEN** those photos are shown without the black & white effect, without a restart

### Requirement: A failing plugin does not affect others
If loading a plugin's module fails, or the module does not export what this plugin API version requires, that plugin SHALL get status `error` with the failure message. Paloma and all other plugins SHALL keep working. Switching the plugin on again SHALL retry loading it.

#### Scenario: Module throws on load
- **WHEN** an external plugin's module throws an error while it is loaded
- **THEN** the plugin is listed with status `error` and the error message, and the bundled filters still work

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

### Requirement: Filter names are unique across plugins
A filter name SHALL belong to at most one plugin. If an enabled plugin contributes a filter whose name is already taken by a bundled plugin, or by an external plugin whose id sorts first, that filter SHALL NOT be available. The plugin's other filters SHALL still work, and the plugin SHALL show a warning naming the filter.

#### Scenario: External plugin redefines sepia
- **WHEN** an enabled external plugin contributes filters `sepia` and `grain`
- **THEN** `sepia` steps are still rendered by the bundled filter, `grain` is available, and the external plugin shows a warning naming `sepia`

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

### Requirement: Plugin texts follow the active language
Plugin names, descriptions, filter labels and parameter labels SHALL be shown in the active UI language if the plugin provides it, otherwise in English.

#### Scenario: Translation provided
- **WHEN** the active language is Ukrainian and a plugin's name is `{"en": "Film grain", "uk": "Плівкове зерно"}`
- **THEN** the plugin is shown as `Плівкове зерно`

#### Scenario: Translation missing
- **WHEN** the active language is German and the same plugin has no `de` name
- **THEN** the plugin is shown as `Film grain`

### Requirement: Plugins view
The top bar SHALL open a Plugins view that lists every plugin with its name, description, version, whether it is bundled or external, a switch to turn it on or off, and any error or warning. The view SHALL say that external plugins run with full access to the computer. If switching fails, the view SHALL show the error in the active language and keep the previous state.

#### Scenario: Switch on in the view
- **WHEN** the user opens Plugins and switches on an external plugin
- **THEN** the switch shows it as on, and its filters appear in the editor

#### Scenario: Plugin with an error
- **WHEN** a plugin failed to load
- **THEN** the view shows its error message

### Requirement: Filter icons stay inside the plugin folder
Paloma SHALL serve a filter's icon only if it is an `.svg` file inside its plugin's folder and the plugin is active. An icon path that leads outside the plugin folder, or a file that is missing or not `.svg`, SHALL NOT be served. Such a filter SHALL have no icon URL, the plugin SHALL show a warning naming the filter, and the edit bar SHALL show a generic filter icon for it. The filter SHALL still work.

#### Scenario: Path outside the plugin
- **WHEN** an enabled plugin declares the icon `../../secret.svg` for its filter `grain`
- **THEN** `grain` has no icon URL, the plugin shows a warning naming `grain`, and the edit bar shows `grain` with the generic icon

#### Scenario: Missing icon file
- **WHEN** an enabled plugin declares `icons/grain.svg` and the file does not exist
- **THEN** `grain` is offered with the generic icon and works as before
