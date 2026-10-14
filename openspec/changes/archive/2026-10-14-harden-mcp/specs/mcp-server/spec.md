# Spec Delta

## MODIFIED Requirements

### Requirement: Tools to find and read objects
`search_photos` SHALL take the photo selection parameters (folder, album, tag, person, search text, starred, located, date range, include hidden), `limit` (at most 200) and `offset`, and return photo documents and `total`. Each photo document in the result SHALL carry `images` with a temporary `thumbnail` and `preview` URL, as `mcp-image-links` describes. `list_objects` SHALL list documents of one type. `get_objects` SHALL return the documents of up to 200 given objects of one type, with unknown or unseen ids listed as not found; for photos it SHALL take `includeHidden` (default false), and hidden photos SHALL be listed as not found unless it is true. Documents of photos returned by `get_objects` SHALL carry the same `images`. They SHALL need `library.view`.

#### Scenario: Search by text
- **WHEN** a client calls `search_photos` with `{"query": "sunrise", "limit": 20}`
- **THEN** the result has at most 20 photo documents whose texts contain `sunrise`, each with `images`, and the number of all matches

#### Scenario: Some ids unknown
- **WHEN** a client calls `get_objects` with type `photo` and ids 7 and 99999
- **THEN** the result has the document of photo 7 and lists 99999 as not found

#### Scenario: Hidden photo by id
- **WHEN** photo 7 is hidden and a client with `library.view` calls `get_objects` with type `photo` and ids 7 without `includeHidden`
- **THEN** the result lists 7 as not found and has no document for it

### Requirement: Tool view_photo
`view_photo` SHALL return a photo as a JPEG image content item that the AI can look at, rendered through its saved edits and fitted within `maxSize` pixels (default 1024, from 64 to 1600), together with the photo document and `uri_valid_time_sec` with a temporary URL to the same image. Given `edits`, it SHALL render those steps instead without saving them, validated as for a preview; such a rendering SHALL NOT get a temporary URL, and its result SHALL say so. It SHALL need `library.view` and SHALL change no file. For a hidden photo it SHALL return a tool error with code `object_not_found`, whatever `includeHidden` says.

#### Scenario: Look at a photo
- **WHEN** a client calls `view_photo` for a 4000×3000 photo with `{"maxSize": 800}`
- **THEN** the result has an 800×600 JPEG image, the photo's document and a temporary URL to that image

#### Scenario: Try a crop before saving
- **WHEN** a client calls `view_photo` with `{"edits": [{"filter": "crop64", "rect": {"left": 0, "top": 0, "right": 0.5, "bottom": 1}}]}`
- **THEN** the image shows the left half of the photo, the result has no temporary URL, and the photo's saved edits are unchanged

#### Scenario: Hidden photo
- **WHEN** a client calls `view_photo` for hidden photo 7
- **THEN** the tool result is an error with code `object_not_found` and no image

## ADDED Requirements

### Requirement: No physical paths in MCP output
No MCP result, error, resource or task message SHALL contain an absolute path of the server's file system or of a photo file, for example a folder path, a file name with its folder, or a path quoted from a library error. Photo, folder and album documents SHALL identify files and folders by id and name, not by path. Failures that would name a file SHALL be reported with a message that does not name it.

#### Scenario: Corrupt photo file
- **WHEN** a client calls `view_photo` for a photo whose file cannot be decoded
- **THEN** the tool error has code `render_failed` and its text contains no path starting with `/`

#### Scenario: Photo document
- **WHEN** a client calls `get_objects` with type `photo` and id 7
- **THEN** the document has `folder` with `id` and `name` and no `path`

#### Scenario: Task message
- **WHEN** an AI run fails on a photo whose file is missing and a client calls `get_ai_run`
- **THEN** the failure text names the photo by id and contains no path

### Requirement: Hidden photos are not served through MCP
MCP SHALL NOT issue a temporary image URL for a hidden photo, and SHALL NOT render a hidden photo for `view_photo`, whatever `includeHidden` or `edits` the client gives. Photo documents of hidden photos SHALL be returned only where `includeHidden` allows it, with no `images`.

#### Scenario: Hidden photo in search with includeHidden
- **WHEN** a client calls `search_photos` with `{"includeHidden": true}` and photo 9 is hidden
- **THEN** photo 9's document is listed with no `images` and no temporary URL is issued for it

### Requirement: Tool arguments have size limits
Every free-text argument of an MCP tool SHALL have a maximum length, and every list argument a maximum number of items, as the published tool schema states them. A value over a limit SHALL be refused as a tool error with code `invalid_field` that names the field, before anything runs or changes.

#### Scenario: Limits per argument
- **WHEN** a client reads the limits of the tools
- **THEN** `query` allows 500 characters; `album`, `person`, `taskId`, object ids of type string and `tag` allow 100 characters; `outputDir` allows 200 characters; `photoIds` of export and AI runs allow 1 000 items; `ids` of `get_objects` allows 200 items; `edits` allows 100 steps and 64 KiB serialised; `changes` allows 1 000 items, each 64 KiB serialised at most

#### Scenario: Oversized search text
- **WHEN** a client calls `search_photos` with a `query` of 501 characters
- **THEN** the tool error has code `invalid_field` and field `query`, and no search runs

#### Scenario: Oversized edit chain
- **WHEN** a client calls `view_photo` with 101 edit steps
- **THEN** the tool error has code `invalid_field` and field `edits`, and nothing is rendered

### Requirement: Published schema shows the limits
The tool input schemas and the object schema SHALL state each maximum length and item limit, so that a client can check its input before it calls a tool.

#### Scenario: Read the tool list
- **WHEN** a client lists tools
- **THEN** the input schema of `search_photos` gives `maxLength` 500 for `query`
