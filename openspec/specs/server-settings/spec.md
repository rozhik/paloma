# server-settings Specification

## Purpose

Separates what is set for the whole Paloma server, which applies to every user and browser, from the settings remembered in one browser: plugins, and a read-only overview of the server's configuration.

## Requirements

### Requirement: Server settings view
The user menu SHALL offer a Server settings view from the Normal level up to users whose role has `plugins.manage`, and, with auth off, to the single user. It SHALL have a Server section, the Plugins section and the AI section. All its texts SHALL be in the active UI language.

#### Scenario: Administrator opens Server settings
- **WHEN** `anna`, an administrator at level Normal, chooses Server settings in the user menu
- **THEN** the Server settings view shows the Server section, the Plugins section and the AI section

#### Scenario: Editor has no Server settings
- **WHEN** an editor opens the user menu at level Developer
- **THEN** it has no Server settings item

### Requirement: Server section
The Server section SHALL show, read-only: whether users are on, the photo folders and excluded folders, the export folder, the data folder, the external plugins folder, the session lifetime, the default request rate, and the Paloma version. It SHALL say that these are set in the server's `.env` file and take effect after a restart.

#### Scenario: Users on
- **WHEN** the server runs with `PALOMA_AUTH=on`, `PALOMA_PHOTOS_DIRS=/photos/family,/photos/work` and `PALOMA_RATE_LIMIT=300`
- **THEN** the Server section shows users as on, the folders `/photos/family` and `/photos/work`, and 300 requests per minute

### Requirement: Server information API
`GET /api/server/info` SHALL return the values the Server section shows. When auth is on it SHALL need `plugins.manage` and otherwise fail with 403.

#### Scenario: Editor asks for server information
- **WHEN** auth is on and an editor requests `GET /api/server/info`
- **THEN** the server responds 403 naming `plugins.manage`

#### Scenario: Users off
- **WHEN** auth is off and a client requests `GET /api/server/info`
- **THEN** the response says users are off and lists the photo folders
