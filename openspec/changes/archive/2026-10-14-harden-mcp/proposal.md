# Proposal

## Why

The MCP server gives AI clients the library, but four of its promises do not hold today:

- **Images are not links.** `view_photo` returns the JPEG inline and search results carry no thumbnail or preview address, so a client cannot hand an image to another tool or show it later.
- **Server paths leak.** Photo and folder documents carry the absolute folder path (`folder.path`), and tool errors and task messages can carry the physical path of a file (for example a sharp "input file is missing: /…" message, or an AI run's failure text).
- **Hidden photos are served.** `view_photo` and `get_objects` read photos with `includeHidden` forced on, and the photo image lookup does not exclude hidden photos, so a hidden photo's pixels can be rendered through MCP by id.
- **Input has no size limits.** Free-text fields (caption, album and person texts, search text, tags, `outputDir`, task ids, edit chains) have no `maxLength` or item limit, so one call can send an arbitrarily large payload into the database, the render pipeline or a log.

This change makes MCP return temporary image addresses, removes physical paths and hidden-photo images from MCP output, and bounds every input.

## What Changes

- **MCP image links**: every image the MCP server returns (thumbnail and preview of a photo, and the image of `view_photo`) comes with a temporary URL that is valid for `uri_valid_time_sec` seconds. The result reports `uri_valid_time_sec` next to the URLs. The URL is a capability: it carries its own random secret and needs no Authorization header, and it stops working when its time runs out, when its token is revoked, or when the photo is no longer visible to the token. The lifetime is configured in `.env`. (New capability `mcp-image-links`.)
- **BREAKING (MCP only)**: `view_photo` keeps the inline JPEG for the model and adds the temporary URL; search and object results for photos add `images.thumbnail` and `images.preview` with their URLs.
- **No physical paths in MCP output**: no absolute path appears in any MCP tool result, error, task message, resource or the AI guide. Photo and folder documents stop exposing `folder.path` (MODIFIED in `object-model`; the document shape is set in design). Errors and task messages that contain a file path are reduced to a message without it.
- **Hidden photos are not served through MCP**: no image URL is issued for a hidden photo, and `view_photo` refuses one, whatever `includeHidden` says. Metadata of a hidden photo is still returned only when the caller asks for hidden photos (`get_objects` gains `includeHidden`).
- **Length and size limits**: every free-text tool argument (`mcp-server`, MODIFIED and ADDED) and every free-text changeset field (`object-changes`, ADDED) gets a maximum length or item limit, and the published JSON Schema shows it. Requests over a limit fail with 400 or a tool error `invalid_field`, naming the field.

## Capabilities

### New Capabilities
- `mcp-image-links`: temporary, capability-style URLs for photo images returned by the MCP server, their lifetime, revalidation on use and the configuration of the lifetime.

### Modified Capabilities
- `mcp-server`: image results, hidden-photo rules for tools, path-free output, and input limits on tool arguments.
- `object-model`: photo and folder documents no longer carry the absolute folder path; folder identity is given by id and name.
- `object-changes`: changeset text fields have maximum lengths and item limits.

## Assumptions

These are decisions taken without asking; each can be redirected before implementation.

- The lifetime setting is `PALOMA_MCP_URI_VALID_SEC` (default 300, allowed 10 to 3600), and the JSON field is `uri_valid_time_sec`.
- Image links and hidden-photo rules change for MCP only. The REST API and the web UI keep their current image URLs and their behavior for hidden photos, because the owner can show hidden photos in the UI on purpose. The removal of `folder.path` applies to `/api/objects` too, since it is the same document.
- Length limits reuse the existing constants where they exist (person name and alias 200, comment 5000, link 2000, links 20, AI description 2000) and set the rest to the values in design.
- The changeset limits apply to REST too, since the changeset validator is shared.

## Out of Scope

- The `/api/raw/:photoId` route and `/api/cache/*` routes for hidden photos in the web API. They are the same class of exposure but serve the UI; they are listed as open questions for the user and not changed here.
- Rate limits and quotas of MCP requests (already counted against the token's request rate).

## Impact

- Code: `server/src/mcp/tools.ts`, `server/src/mcp/server.ts`, `server/src/mcp/route.ts`, `server/src/model/documents.ts`, `server/src/model/schemas.ts`, `server/src/model/guide.ts`, `server/src/model/changes/*`, `server/src/services/renderApi.ts`, `server/src/services/apiError.ts`, `server/src/tasks/queue.ts`, `server/src/ai/runner.ts`, `server/src/config.ts`, and a new image-link route and token-signing module on the server.
- API: new route for temporary images (not under the bearer-only MCP route); MCP tool results gain `uri_valid_time_sec` and image URLs; document shape changes for MCP and `/api/objects` (no `folder.path`); new `maxLength` values in the published schema.
- Configuration: `.env.example` gains `PALOMA_MCP_URI_VALID_SEC`.
- Dependencies: none expected; signing uses Node's `crypto`.
- Data: none; no database migration.
