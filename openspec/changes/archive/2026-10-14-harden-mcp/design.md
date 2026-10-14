# Design

## Context

The MCP adapter lives in `server/src/mcp/` (`tools.ts` defines the tools, `server.ts` builds one stateless server per request, `route.ts` mounts `POST /api/mcp` behind a bearer token). Tools call the same services as the REST routes: `renderPreview` and `photoImage` in `services/renderApi.ts` render images, `ThumbnailService` keeps the cached WebP files in the cache folder, and `documents.ts` builds the JSON documents from `photoApi.listPhotos`. See proposal.md for the why.

Facts found while reading the code that shape the design:

- `photoDocumentsById` lists photos with `includeHidden: 'true'`, so `get_objects` and `view_photo` see hidden photos. `getApiPhoto` (used by `renderPreview` and `photoImage`) does not filter hidden photos either.
- `folder.path` is set in `photoDocuments` (`folder.path`), `folderDocuments` (`path`) and the schemas (`model/schemas.ts`), and the AI guide tells clients to combine `folder.path` with `fileName`.
- Error bodies carry raw messages: `renderPreview` returns `err.message` (sharp messages usually contain the input path), the global error handler in `routes/index.ts` returns `err.message`, `tasks/queue.ts` stores `err.message` as `task.error`, and `ai/runner.ts` stores each photo's failure text. Task and AI failures reach MCP through `list_tasks`, `get_ai_run` and `start_ai_run`.
- Zod input schemas in `tools.ts` have no `maxLength` for strings. The changeset schema in `model/schemas.ts` has no string limits either, and `editChain` is unbounded.
- Files in the photo folders are only read (`sharp` renders them). Thumbnails and previews are written to the cache folder through `ThumbnailService`. Nothing writes to a photo file or to a `.paloma.json` in this change.

## Goals / Non-Goals

**Goals:**
- Every MCP image comes with a temporary URL that expires after `uri_valid_time_sec`, and the URL is re-checked when it is used.
- No absolute path leaves through MCP: not in documents, errors, task messages or the guide.
- Hidden photos produce no image through MCP, and `get_objects` does not list them without `includeHidden`.
- Every MCP string and list input and every changeset text value has a documented maximum.

**Non-Goals:**
- REST image routes (`/api/photos/:id/thumbnail`, `/api/cache/*`, `/api/raw/:id`) and their hidden-photo behavior. They serve the UI and keep their behavior in this change (see proposal Out of Scope).
- A database table for links. Links are stateless.
- Changing the photo files, the sidecar format or the render pipeline.

## Decisions

### D1. Temporary links are signed, not stored
A link is `GET /api/mcp/media/<payload>.<signature>`, where `<payload>` is base64url JSON `{p: photoId, k: "thumb" | "preview" | maxSize, r: renderKey, t: tokenId, e: expiresAtMs}` and `<signature>` is HMAC-SHA256 over the payload with a 32-byte secret generated at server start. The route is outside the bearer-token route, because the link is the credential.

- The payload carries only ids, the render key and the expiry. It never carries a path or a file hash, so the URL reveals nothing about the file.
- `uri_valid_time_sec` is the configured lifetime; `e` is `now + uri_valid_time_sec` at the time the result is made.
- Alternative considered: a table of random secrets. It allows revocation by row, but needs a migration and cleanup of expired rows. Rejected: revocation is handled by the token check in D2, and the signature already gives expiry.
- Trade-off: links stop working after a server restart, because the secret is in memory. That is acceptable for links that live a few minutes; the restart is documented in the guide.

### D2. Each fetch re-checks the token and the photo
On fetch the route verifies the signature and `e`, then loads the token by `t` and requires it to be unrevoked, unexpired, to have `library.view`, and its owner to be active. It then runs the photo lookup as that owner (through the same request-scope helper `auth/scope.ts` uses for `currentAccess()`), requires the photo to be visible and not hidden, and requires the current render key to equal `r`. Any failure answers 404 with no body detail. Requirements: `mcp-image-links` "Links are checked again when used".

### D3. Image bytes are sent from a buffer
The media route reads the cached file (or renders `k` as a JPEG for `maxSize`) into a buffer and sends it with `Content-Type` and `Cache-Control: private, no-store`. It does not use `sendFileOr404`, because a failed `sendFile` goes to the global error handler, which puts `err.message` (a path) in the body. Thumbnail and preview links use `ThumbnailService.getImage`; a `view_photo` link renders through `renderPreview(…, 'jpeg')` at the same `maxSize`, and is rendered again on each fetch.

### D4. MCP builds the image fields, not the documents
`documents.ts` stays the source of documents for REST. The MCP layer adds `images` after building documents: `search_photos` and `get_objects` call `withImages(documents, principal, baseUrl)`, which returns `images: {thumbnail: {url}, preview: {url}}` for every visible, non-hidden photo and nothing for hidden ones. `baseUrl` is the request's own `protocol://host`, the same value `originAllowed` compares. `view_photo` adds `uri_valid_time_sec` and `image: {url}` next to its inline JPEG, and no URL when `edits` are given.

### D5. Paths are removed at the source and redacted at the edge
- Documents: `folder` becomes `{id, name}` in `photoDocuments`; `folderDocuments` drops `path`; the schemas and `FolderDocument` in `shared/types.ts` drop `path` (the `shared/types.ts` edit is hand-written, `types.js` is not touched). The guide text changes to "folder id and fileName name the file in this library".
- Errors: `renderPreview` and `photoImage` return a fixed message (`Could not render the photo`) and log the original error on the server. `tasks/queue.ts` and `ai/runner.ts` replace the photo's file path in stored failure text with `photo <id>` before saving it.
- Edge: `jsonResult` and `errorResult` in `tools.ts` run a redaction pass that replaces any absolute POSIX or Windows path in text with `<path>`. It is a second line of defence, not the fix; a test feeds a path through each source and checks the MCP output.

### D6. Hidden photos are filtered in the MCP layer
`get_objects` takes `includeHidden` and passes it to `getDocuments`, which passes it to `photoDocumentsById`; hidden photos are then listed as not found. `view_photo` returns `object_not_found` for a hidden photo (after loading its document). `withImages` skips hidden photos. `search_photos` keeps its existing `includeHidden` meaning for metadata only.

### D7. Limits are zod constraints, shared with REST where the validator is shared
- Tool inputs: `.max()` on each string and array (`query` 500, `album`/`person`/`taskId`/object-id strings 100, `tag` 100, `outputDir` 200, `photoIds` 1 000, `ids` 200, `changes` 1 000, `edits` 100). `zod` emits these as `maxLength` / `maxItems` in the tool schema.
- Serialized size for `changes` items and `edits` (64 KiB): a `.refine` on the item, because JSON size is not a zod constraint.
- Changeset schema (`model/schemas.ts`): the maximums in the `object-changes` delta, using the existing constants where they exist (`MAX_NAME`, `MAX_ALIAS`, `MAX_COMMENT`, `MAX_LINKS`, `MAX_LINK` in `services/personValidation.ts`, `MAX_DESCRIPTION` in `ai/models.ts`). The changeset validator is shared with REST, so REST gets the same limits. This is intended.
- Lengths are counted in JavaScript string length (UTF-16 units), as zod does.

### D8. Configuration
`config.mcp.uriValidSec` is read from `PALOMA_MCP_URI_VALID_SEC` (default 300, integer 10 to 3600). An invalid value stops the server at start, in the same way `PALOMA_MCP` does. `.env.example` documents it.

## Reuse and changes to existing code

- **Reused as is**: `renderPreview`, `ThumbnailService.getImage`, `renderKey` (`services/photoImages.ts`), `apiError`, `runChangeset`, `getDocuments`, the bearer-token check in `need(...)`, the Origin check in `route.ts`.
- **Rewritten**: `mcp/tools.ts` (`view_photo`, `get_objects`, `search_photos` results, input limits, redaction in result helpers); `renderApi.ts` error bodies; `model/documents.ts` folder shape; `model/schemas.ts` folder and limit constraints; `model/guide.ts` path wording; `tasks/queue.ts` and `ai/runner.ts` failure text.
- **New**: `server/src/mcp/media.ts` (signing, verification, the route handler), `server/src/mcp/images.ts` (`withImages`, `baseUrl`), `server/src/config.ts` entry, tests next to each file.
- **Dropped**: nothing.

## Risks / Trade-offs

- [Links outlive the permission they were made under] → D2 re-checks token, permission, hidden flag and render key on every fetch; the lifetime is short (default 300 s).
- [Guessing or replaying a link] → 256-bit HMAC over a payload with an expiry; replay only works until `e`.
- [Restart invalidates links] → accepted; documented.
- [Host header sets the base of the URL] → the URL is returned to the caller that already authenticated; the Origin check still applies to the MCP route. Not a new exposure.
- [`view_photo` link renders on each fetch] → CPU cost only when a link is fetched, bounded by the 1 600 px limit and the link's lifetime. Like the REST image routes, link fetches do not count toward the request rate quota.
- [Path redaction regex mangles text with slashes] → it only matches a slash at the start of a token that looks like a path with at least two segments; tests cover normal text and a 1/2 ratio.
- [Schema change breaks REST clients that read `folder.path`] → the client does not use `/api/objects` documents (to be checked in tasks); the change is listed as breaking in the proposal.

## Migration Plan

No data migration. Deploy with the server. Rollback is a revert: the links are only valid for minutes, so nothing persists. Clients that cached a photo's `folder.path` must read `folder.name` instead.
