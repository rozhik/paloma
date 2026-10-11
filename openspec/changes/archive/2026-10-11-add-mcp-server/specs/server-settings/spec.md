# Spec Delta

## MODIFIED Requirements

### Requirement: Server section
The Server section SHALL show, read-only: whether users are on, the photo folders and excluded folders, the export folder, the data folder, the external plugins folder, the session lifetime, the default request rate, whether MCP is on and, when it is, the MCP endpoint address, and the Paloma version. It SHALL say that these are set in the server's `.env` file and take effect after a restart.

#### Scenario: Users on
- **WHEN** the server runs with `PALOMA_AUTH=on`, `PALOMA_PHOTOS_DIRS=/photos/family,/photos/work` and `PALOMA_RATE_LIMIT=300`
- **THEN** the Server section shows users as on, the folders `/photos/family` and `/photos/work`, and 300 requests per minute

#### Scenario: MCP on
- **WHEN** the server runs without `PALOMA_MCP` and the Server section is opened from `http://localhost:3000`
- **THEN** it shows MCP as on with the address of `/api/mcp` on the API server, and says that clients connect with a personal API token when users are on

#### Scenario: MCP off
- **WHEN** the server runs with `PALOMA_MCP=off`
- **THEN** the Server section shows MCP as off and no address

### Requirement: Server information API
`GET /api/server/info` SHALL return the values the Server section shows, including `mcp` with whether it is on and the endpoint path. When auth is on it SHALL need `plugins.manage` and otherwise fail with 403.

#### Scenario: Editor asks for server information
- **WHEN** auth is on and an editor requests `GET /api/server/info`
- **THEN** the server responds 403 naming `plugins.manage`

#### Scenario: Users off
- **WHEN** auth is off and a client requests `GET /api/server/info`
- **THEN** the response says users are off and lists the photo folders

#### Scenario: MCP in the information
- **WHEN** MCP is on and a client requests `GET /api/server/info`
- **THEN** the response has `"mcp": {"enabled": true, "path": "/api/mcp"}`
