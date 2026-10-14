# mcp-image-links Specification

## Purpose

Gives the MCP server's photo images as temporary, shareable links that expire on a set schedule, so an AI client can hand an image to another tool or show it later without the photo library's access rules being repeated on every fetch.

## Requirements

### Requirement: Every image result has a temporary URL
Every image that the MCP server returns for a photo — its thumbnail, its preview and the image of `view_photo` — SHALL come with an absolute `http` or `https` URL on the server's own address, and the tool result SHALL report `uri_valid_time_sec`, the number of seconds that URL stays valid. A result SHALL NOT carry an image as a bare file path, and SHALL NOT carry a URL that never expires.

#### Scenario: Search returns thumbnails
- **WHEN** a client with `library.view` calls `search_photos` and photo 7 is found
- **THEN** its document has `images.thumbnail.url` and `images.preview.url`, and the result has `uri_valid_time_sec` with the configured value

#### Scenario: Viewing a photo
- **WHEN** a client calls `view_photo` for photo 7
- **THEN** the result has the JPEG image, and `uri_valid_time_sec` with a URL to the same image

### Requirement: Links expire after uri_valid_time_sec
A temporary URL SHALL stop working after `uri_valid_time_sec` seconds from the moment the tool result was made. The lifetime SHALL be set by `PALOMA_MCP_URI_VALID_SEC` in `.env`, from 10 to 3600 seconds, with a default of 300. A value outside that range or not a whole number SHALL stop the server at start with a message naming `PALOMA_MCP_URI_VALID_SEC`.

#### Scenario: Link used in time
- **WHEN** a client fetches a thumbnail URL 60 seconds after it was returned, with `PALOMA_MCP_URI_VALID_SEC=300`
- **THEN** the server responds with the JPEG or WebP image

#### Scenario: Link used too late
- **WHEN** a client fetches the same URL 301 seconds after it was returned
- **THEN** the server responds 404 and sends no image

#### Scenario: Invalid setting
- **WHEN** the server starts with `PALOMA_MCP_URI_VALID_SEC=0`
- **THEN** it exits with a message naming `PALOMA_MCP_URI_VALID_SEC` and its allowed range

### Requirement: A link is a bearer secret and needs no login
A temporary URL SHALL carry an unguessable secret and SHALL be served without an Authorization header or a login cookie. Each URL SHALL be for one photo, one size (thumbnail or preview) and the edits the photo had when the result was made.

#### Scenario: Fetch without a token
- **WHEN** a client fetches a valid temporary URL without any Authorization header
- **THEN** the server responds with the image

#### Scenario: Guessed address
- **WHEN** a client requests the image address of photo 8 with a secret that was not issued
- **THEN** the server responds 404

### Requirement: Links are checked again when used
When a temporary URL is fetched, the server SHALL check again that the token that made it still exists, is not revoked or expired, and still has `library.view`; and that the photo is visible to the token's owner and is not hidden. If any check fails, the server SHALL respond 404 and send no image.

#### Scenario: Token revoked
- **WHEN** the token that made a valid URL is revoked and the URL is fetched
- **THEN** the server responds 404

#### Scenario: Photo hidden afterwards
- **WHEN** photo 7 is set to hidden after its URL was returned, and the URL is fetched
- **THEN** the server responds 404 and sends no image

### Requirement: Links reveal no paths
A temporary URL SHALL NOT contain a folder path, a file name or the file's content hash. Its response SHALL NOT name the physical file, not even in an error body.

#### Scenario: Look at the URL
- **WHEN** a client reads the URL returned for photo 7 in `/photos/trip/img.jpg`
- **THEN** the URL contains neither `/photos`, `trip` nor `img.jpg`

### Requirement: Link responses are not cached
Responses to a temporary URL SHALL carry `Cache-Control: private, no-store`, so that no cache keeps a photo after its link has expired.

#### Scenario: Response headers
- **WHEN** a valid temporary URL is fetched
- **THEN** the response has `Cache-Control: private, no-store`
