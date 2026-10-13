# mcp-server Specification

## Purpose

Lets AI clients such as Claude Desktop, Claude Code or local agents read, search, look at and change the photo library through the Model Context Protocol, with the same permissions and folder-file rules as Paloma's own API.

## Requirements

### Requirement: MCP is switched in .env
The server SHALL offer MCP when `PALOMA_MCP` is `on` or not set, and SHALL NOT offer it when it is `off`. Any other value SHALL stop the server at start with a message naming `PALOMA_MCP`.

#### Scenario: MCP off
- **WHEN** the server runs with `PALOMA_MCP=off` and a client posts to `/api/mcp`
- **THEN** the server responds 404

#### Scenario: Invalid value
- **WHEN** the server starts with `PALOMA_MCP=yes`
- **THEN** it exits with a message naming `PALOMA_MCP` and its allowed values

### Requirement: Streamable HTTP endpoint
The MCP endpoint SHALL be `/api/mcp` on the Paloma server's own port, speaking MCP over Streamable HTTP. It SHALL answer `initialize` with the server name `paloma`, the Paloma version, the tools and resources capabilities, and instructions telling the client to read the guide before changing anything.

#### Scenario: Client connects
- **WHEN** an MCP client sends `initialize` to `http://localhost:3001/api/mcp`
- **THEN** the response names the server `paloma` and has instructions mentioning the guide

### Requirement: MCP authentication
When auth is on, every MCP request SHALL carry `Authorization: Bearer <token>` with a valid personal API token, and SHALL act as the token's owner with the token's permissions, as the api-tokens capability describes. Browser session cookies SHALL NOT be accepted. A request without a valid token SHALL get 401 with a `WWW-Authenticate: Bearer` header. When auth is off, no token SHALL be needed.

#### Scenario: No token
- **WHEN** auth is on and a client posts `initialize` to `/api/mcp` without `Authorization`
- **THEN** the server responds 401 with `WWW-Authenticate: Bearer`

#### Scenario: Cookie only
- **WHEN** auth is on and a request carries only a valid login cookie
- **THEN** the server responds 401

#### Scenario: Revoked token
- **WHEN** the token used by an MCP client is revoked and the client calls a tool
- **THEN** the server responds 401

### Requirement: Requests from web pages are refused
An MCP request with an `Origin` header SHALL be refused with 403 unless the origin is the server's own or the configured client origin, so that a web page cannot drive a local Paloma through the visitor's browser.

#### Scenario: Foreign web page
- **WHEN** a page on `https://evil.example` posts to `http://localhost:3001/api/mcp` with `Origin: https://evil.example`
- **THEN** the server responds 403 and runs no tool

### Requirement: Tools follow permissions
The tool list SHALL contain only the tools the caller's permissions allow, and each tool SHALL need the permission of the matching REST endpoint. Calling a tool without its permission SHALL return a tool error naming the missing permission and SHALL change nothing. MCP requests SHALL count toward the request rate quota as API requests.

#### Scenario: Viewer token
- **WHEN** a client with a token that has only `library.view` lists tools
- **THEN** the list has `describe_model`, `search_photos`, `get_objects`, `list_objects`, `library_stats` and `view_photo`, and not `apply_changes`, `start_ai_run` or `export_photos`

### Requirement: Tool describe_model
`describe_model` SHALL return the AI guide and the model schema of the object-model capability. It SHALL need `library.view`.

#### Scenario: Read the model
- **WHEN** a client calls `describe_model`
- **THEN** the result contains the guide text and the JSON Schema

### Requirement: Tools to find and read objects
`search_photos` SHALL take the photo selection parameters (folder, album, tag, person, search text, starred, located, date range, include hidden), `limit` (at most 200) and `offset`, and return photo documents and `total`. `list_objects` SHALL list documents of one type. `get_objects` SHALL return the documents of up to 200 given objects of one type, with unknown or unseen ids listed as not found. They SHALL need `library.view`.

#### Scenario: Search by text
- **WHEN** a client calls `search_photos` with `{"query": "sunrise", "limit": 20}`
- **THEN** the result has at most 20 photo documents whose texts contain `sunrise`, and the number of all matches

#### Scenario: Some ids unknown
- **WHEN** a client calls `get_objects` with type `photo` and ids 7 and 99999
- **THEN** the result has the document of photo 7 and lists 99999 as not found

### Requirement: Tool library_stats
`library_stats` SHALL take the photo selection parameters and return the totals of the photo statistics API. It SHALL need `library.view`.

#### Scenario: Statistics of an album
- **WHEN** a client calls `library_stats` with an album token
- **THEN** the result has the album's photo count, total size, date range and people

### Requirement: Tool apply_changes
`apply_changes` SHALL take a changeset and `dryRun`, apply it as the object-changes capability describes, and return the change results. Errors SHALL be returned as tool errors with the same code, change index and field as the REST response. The permissions SHALL be checked per change as for `POST /api/changes`; the tool SHALL be listed for callers with `photos.edit`, `albums.manage` or `people.manage`.

#### Scenario: Dry run through MCP
- **WHEN** a client calls `apply_changes` with a changeset adding the tag `sea` to photos 3 and 7 and `"dryRun": true`
- **THEN** the result lists both photos with their tags before and after, and no file changes

#### Scenario: Invalid change
- **WHEN** a client calls `apply_changes` with a change that sets `fileName`
- **THEN** the tool result is an error with code `read_only_field`, change 0 and field `fileName`

### Requirement: Tool view_photo
`view_photo` SHALL return a photo as a JPEG image content item that the AI can look at, rendered through its saved edits and fitted within `maxSize` pixels (default 1024, from 64 to 1600), together with the photo document. Given `edits`, it SHALL render those steps instead without saving them, validated as for a preview. It SHALL need `library.view` and SHALL change no file.

#### Scenario: Look at a photo
- **WHEN** a client calls `view_photo` for a 4000×3000 photo with `{"maxSize": 800}`
- **THEN** the result has an 800×600 JPEG image and the photo's document

#### Scenario: Try a crop before saving
- **WHEN** a client calls `view_photo` with `{"edits": [{"filter": "crop64", "rect": {"left": 0, "top": 0, "right": 0.5, "bottom": 1}}]}`
- **THEN** the image shows the left half of the photo and the photo's saved edits are unchanged

### Requirement: Tools for AI tasks
`list_ai_tasks` SHALL return the AI tasks with their readiness. `start_ai_run` SHALL add a run of a task on given photos to the task queue and return the queued task. `get_ai_run` SHALL return the run with a given task id, or the caller's most recent run when none is given, with its state, progress and, to its owner, its summary. `cancel_ai_run` SHALL cancel the run with a given task id as the tasks API does. They SHALL need `ai.run`.

#### Scenario: Run Tags on photos
- **WHEN** a client with `ai.run` calls `start_ai_run` with task `tags` and photo ids 3 and 7
- **THEN** a run of Tags on those photos is queued, and `get_ai_run` with its task id reports its state and progress

#### Scenario: A run is in progress
- **WHEN** a run exists and a client calls `start_ai_run`
- **THEN** the new run is queued behind it and the tool result says it is waiting

#### Scenario: Cancel another user's run
- **WHEN** a client of `eve`, an editor, calls `cancel_ai_run` with the task id of `anna`'s run
- **THEN** the tool result is an error naming `users.manage`, and the run goes on

### Requirement: Tool export_photos
`export_photos` SHALL export the given photos into a folder inside the caller's export folder with the given quality and width, as the export API does, by adding an export task, waiting until it ends, and returning the written file paths relative to the export folder. It SHALL need `export` and follow the export space quota. When the task is cancelled, the tool result SHALL say so and list the files written.

#### Scenario: Destination outside the export folder
- **WHEN** a client calls `export_photos` with `outputDir` `../../etc`
- **THEN** the tool result is an error naming `outputDir` and nothing is written

#### Scenario: Export waits for the queue
- **WHEN** an AI task is running and a client calls `export_photos` with two photos
- **THEN** the tool returns after the export task has run, with the two written file paths

### Requirement: Resources
The server SHALL offer the resources `paloma://guide` (Markdown) and `paloma://schema` (JSON) with the same content as `GET /api/schema/guide` and `GET /api/schema`.

#### Scenario: Read the guide resource
- **WHEN** a client reads `paloma://guide`
- **THEN** it gets the AI guide as `text/markdown`

### Requirement: Tool list_tasks
`list_tasks` SHALL return the tasks as `GET /api/tasks` returns them to the caller. It SHALL need `library.view`.

#### Scenario: List the queue
- **WHEN** a Tags run of `anna` is running and an export of `ben` waits, and `ben`'s client calls `list_tasks`
- **THEN** the result lists the Tags run started by `anna` and then `ben`'s export, marked as his
