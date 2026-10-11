## MODIFIED Requirements

### Requirement: Plugins API
`GET /api/plugins` SHALL return every listed plugin with its id, name and description in the requested language, version, source (`bundled` or `external`), level, whether it is on, status (`active`, `off` or `error`), error and warning messages, and, when active, its filters with their labels in the requested language, their level and, for a filter with a usable icon, the URL of that icon, its auth providers with their id, kind and label in the requested language, and its AI providers with their id and label in the requested language. `PATCH /api/plugins/:id` with `{"enabled": true|false}` SHALL switch the plugin and respond with it. Switching an unknown plugin SHALL fail with 404, switching a plugin in `error` status because of its manifest, id or API version SHALL fail with 409, and an invalid body SHALL be rejected with 400. When auth is on, `GET /api/plugins` SHALL need `library.view`, and `PATCH /api/plugins/:id` SHALL need `plugins.manage` and otherwise fail with 403.

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

#### Scenario: AI provider in the list
- **WHEN** the UI language is English and a client requests `GET /api/plugins`
- **THEN** `ai-openai` is listed with the AI provider `openai` labelled `OpenAI`
