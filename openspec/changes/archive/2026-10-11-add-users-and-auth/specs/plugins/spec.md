## ADDED Requirements

### Requirement: Plugins contribute auth providers
A plugin's module SHALL be able to contribute auth providers. Each SHALL have an id that is unique across plugins, a label (a string or an object of language tags to strings that includes `en`) and a kind: `credentials` (a login form with the fields it declares) or `bearer` (a credential sent with each request). A provider of an unknown kind, or whose id another plugin has already contributed, SHALL NOT be available, and the plugin SHALL show a warning naming it.

#### Scenario: Bundled providers
- **WHEN** Paloma starts with the bundled plugins on
- **THEN** `GET /api/plugins` lists `auth-password` with the provider `password` of kind `credentials`, and `auth-token` with the provider `token` of kind `bearer`

#### Scenario: Unknown kind
- **WHEN** an enabled external plugin contributes a provider of kind `redirect`
- **THEN** that provider is not offered on the login page and the plugin shows a warning naming it

#### Scenario: Duplicate provider id
- **WHEN** an enabled external plugin contributes a provider with the id `password`
- **THEN** the bundled `password` provider keeps working and the external plugin shows a warning naming `password`

### Requirement: The last login provider stays on
When auth is on, switching off a plugin SHALL be refused with 409 if it would leave no enabled `credentials` provider. If such a plugin fails to load at startup, the server SHALL log that nobody can log in.

#### Scenario: Switch off the password plugin
- **WHEN** auth is on, `auth-password` is the only plugin with a `credentials` provider, and an administrator switches it off
- **THEN** the server responds 409, the plugin stays on, and the Plugins section says that at least one login provider must stay on

### Requirement: Plugins section in Server settings
The Server settings view SHALL have a Plugins section that lists every plugin with its name, description, version, whether it is bundled or external, a switch to turn it on or off, and any error or warning. The section SHALL say that external plugins run with full access to the computer. If switching fails, the section SHALL show the error in the active language and keep the previous state. The top bar SHALL NOT offer a Plugins view, and the Settings view SHALL NOT have a Plugins section.

#### Scenario: Switch on in Server settings
- **WHEN** the user opens Server settings and switches on an external plugin in the Plugins section
- **THEN** the switch shows it as on, and its filters appear in the editor

#### Scenario: Plugin with an error
- **WHEN** a plugin failed to load
- **THEN** the Plugins section shows its error message

#### Scenario: No Plugins in Settings or the top bar
- **WHEN** the level is Developer and the library is shown in any skin, and the user opens Settings
- **THEN** the top bar has no Plugins button and the Settings view has no Plugins section

## MODIFIED Requirements

### Requirement: Plugins API
`GET /api/plugins` SHALL return every listed plugin with its id, name and description in the requested language, version, source (`bundled` or `external`), level, whether it is on, status (`active`, `off` or `error`), error and warning messages, and, when active, its filters with their labels in the requested language, their level and, for a filter with a usable icon, the URL of that icon, and its auth providers with their id, kind and label in the requested language. `PATCH /api/plugins/:id` with `{"enabled": true|false}` SHALL switch the plugin and respond with it. Switching an unknown plugin SHALL fail with 404, switching a plugin in `error` status because of its manifest, id or API version SHALL fail with 409, and an invalid body SHALL be rejected with 400. When auth is on, `GET /api/plugins` SHALL need `library.view`, and `PATCH /api/plugins/:id` SHALL need `plugins.manage` and otherwise fail with 403.

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

#### Scenario: Switching without permission
- **WHEN** auth is on and an editor sends `PATCH /api/plugins/basic-effects` with `{"enabled": false}`
- **THEN** the server responds 403 naming `plugins.manage`, and the plugin stays on

## REMOVED Requirements

### Requirement: Plugins section in Settings
**Reason**: The Settings view keeps only what is remembered in this browser; plugins are a server setting and move to the Server settings view.
**Migration**: See "Plugins section in Server settings". The section, its switches, errors and warnings stay the same, now in the Server settings view opened from the user menu.
