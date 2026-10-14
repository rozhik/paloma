# Tasks

## 1. Configuration

- [x] 1.1 Read `PALOMA_MCP_URI_VALID_SEC` in `server/src/config.ts` (default 300, integer 10 to 3600); stop at start with a message naming it when invalid
- [x] 1.2 Document `PALOMA_MCP_URI_VALID_SEC` in `.env.example` and in `docs/mcp.md`
- [x] 1.3 Test: default, valid value and each invalid value (0, 3601, `abc`, `1.5`) in `server/src/config.test.ts`

## 2. Path-free documents

- [x] 2.1 Check that nothing in `client/` reads `folder.path` from `/api/objects` or the object documents (`grep` in `client/src`); record the result in the commit message
- [x] 2.2 `server/src/model/documents.ts`: `photoDocuments` sets `folder` to `{id, name}`; `folderDocuments` drops `path`
- [x] 2.3 `server/src/model/schemas.ts`: remove `path` from the photo `folder` and the folder document; `shared/types.ts`: same for `FolderDocument` and the photo type (edit the `.ts`, never `.js`)
- [x] 2.4 `server/src/model/guide.ts`: replace "folder.path + fileName names the file" with the folder id and `fileName`
- [x] 2.5 Test in `server/src/model/documents.test.ts`: a photo and a folder document have no `path` key

## 3. Path-free errors and task messages

- [x] 3.1 `server/src/services/renderApi.ts`: 500 bodies use the fixed message `Could not render the photo`; keep the original error in `console.error`
- [x] 3.2 `server/src/routes/index.ts` global error handler: do not return `err.message` for 500s outside development (keep the message server-side)
- [x] 3.3 `server/src/tasks/queue.ts` and `server/src/ai/runner.ts`: replace the photo's file path in stored failure text with `photo <id>` before saving it
- [x] 3.4 Test: a render of a missing or corrupt file, an AI failure and a task failure contain no `/` path in their bodies or stored text

## 4. MCP output redaction

- [x] 4.1 `server/src/mcp/tools.ts`: `jsonResult` and `errorResult` replace absolute paths in text with `<path>`
- [x] 4.2 Test in `server/src/mcp/tools.test.ts`: text with a POSIX path and a Windows path is redacted; `1/2` and a URL are not changed

## 5. Hidden photos through MCP

- [x] 5.1 `server/src/model/documents.ts`: `getDocuments` takes `includeHidden` (default false) and passes it to `photoDocumentsById`
- [x] 5.2 `server/src/mcp/tools.ts`: `get_objects` takes `includeHidden`; `view_photo` returns `object_not_found` for a hidden photo before rendering
- [x] 5.3 Test in `server/src/mcp/tools.test.ts`: hidden photo by id is not found without `includeHidden`; `view_photo` of a hidden photo fails with `object_not_found` even with `includeHidden`

## 6. Input limits

- [x] 6.1 `server/src/mcp/tools.ts`: `.max()` on every string and array argument listed in the `mcp-server` delta; a `.refine` on the serialized size of each `changes` item, of `edits`
- [x] 6.2 `server/src/model/schemas.ts`: maximums of the `object-changes` delta (caption 2000, tags 200 × 100, albums and people 200, album name/location 200, description 5000, person name/alias 200, comment 5000, links 20 × 2000, edits 100), using the existing constants
- [x] 6.3 Test in `server/src/mcp/tools.test.ts`: 501-character query and 101 edit steps are refused with `invalid_field` naming the field; each limit is accepted at its exact value
- [x] 6.4 Test in `server/src/routes/changes.test.ts` (or the nearest changeset test): caption 2001 characters → 400 `invalid_field` `caption`, nothing changes; 2000 characters saved

## 7. Signed temporary links

- [x] 7.1 `server/src/mcp/media.ts`: secret generated at start (32 random bytes); `signLink(payload)` and `verifyLink(url)` with HMAC-SHA256 over base64url JSON `{p, k, r, t, e}`; constant-time comparison
- [x] 7.2 `server/src/mcp/media.ts`: the route handler `GET /api/mcp/media/:link` — verify signature and `e`; load token `t` (unrevoked, unexpired, owner active, has `library.view`); photo lookup as the owner, visible and not hidden; render key equals `r`; send the bytes from a buffer with `Content-Type`, `Cache-Control: private, no-store`; every failure is a 404 with no detail
- [x] 7.3 Mount the route in `server/src/routes/index.ts` (or `mcp/route.ts`) without the bearer-token middleware, and without the Origin check
- [x] 7.4 Test in `server/src/mcp/media.test.ts`: valid link within time → image; after `e` → 404; tampered payload → 404; revoked token → 404; photo made hidden → 404; `Cache-Control` header; response has no path text

## 8. Image fields in MCP results

- [x] 8.1 `server/src/mcp/images.ts`: `withImages(documents, principal, baseUrl)` adds `images.thumbnail.url` and `images.preview.url` for visible, non-hidden photos; `baseUrl` from the request's `protocol://host`
- [x] 8.2 `server/src/mcp/tools.ts`: `search_photos` and `get_objects` (photos) use `withImages`; results carry `uri_valid_time_sec`
- [x] 8.3 `server/src/mcp/tools.ts`: `view_photo` adds `uri_valid_time_sec` and `image.url` (a `view` link with `maxSize`) next to the inline JPEG; no URL when `edits` are given
- [x] 8.4 `server/src/mcp/server.ts` and `route.ts`: pass `baseUrl` and the request into `createMcpServer`
- [x] 8.5 Test in `server/src/mcp/tools.test.ts`: results have `images` and `uri_valid_time_sec`; a hidden photo has no `images`; `view_photo` with `edits` has no URL

## 9. Guide and docs

- [x] 9.1 `docs/mcp.md`: describe temporary links, `uri_valid_time_sec`, the lost-on-restart behaviour, path-free documents and the limits
- [x] 9.2 `server/src/mcp/server.ts` instructions and the tool descriptions in `tools.ts`: mention the links and the limits, without paths

## 10. Verification

- [x] 10.1 Run `npm run build` from the repo root and fix type errors
- [x] 10.2 Run `npm test` from the repo root and fix failures; report the output if anything fails
- [x] 10.3 Run `openspec validate harden-mcp` and fix the deltas it reports
