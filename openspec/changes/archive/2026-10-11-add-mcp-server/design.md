# Design

## Context

- The REST API is a set of endpoint-specific bodies, each backed by a service that already does validation, folder locking and sidecar writes: `photoApi.updatePhoto` / `setPhotosLocation` / `changePhotosKeywords` / `saveEdits`, `albumApi.createAlbumFromPhotos` / `addAlbumPhotos` / `removeAlbumPhotos` / `editAlbumProperties` / `deleteAlbumEverywhere`, `peopleApi.createPerson` / `updatePerson` / `deletePerson` / `addPersonToPhoto` / `removePersonFromPhoto`, `editChain.validateChain`, `photoInfo.getPhotoInfo`, `photoStats`, `listTags`, `listFolders`, `listAlbums`, `listPeople`.
- Multi-folder writes go through `saveFolderByFolder` with `withFolderLock` taken in sorted path order (docs/server-data-layer.md). Its contract — "unreadable sidecar anywhere → 409, nothing written; write failure → earlier folders keep the change" — is what object-changes reuses.
- `authenticate()` in `server/src/auth/middleware.ts` resolves the principal (bearer token or cookie) and runs the rest of the request inside `runWithAccess(...)` (AsyncLocalStorage), so every query made while handling the request — including inside an MCP tool handler awaited from the route — sees only the caller's library. `need()` guards each route; `guards.test.ts` checks every route has one. `rateLimit()` runs for every `/api` request.
- `zod` 3.25 is installed (via drizzle-kit, not declared); the MCP TypeScript SDK (`@modelcontextprotocol/sdk` 1.x) uses zod for tool input schemas.
- Plugin filters and their parameter definitions come from the plugin registry (`RegisteredFilter`, `ParamDefinition` with `number` / `boolean` / `choice` / `rect`).

## Goals / Non-Goals

**Goals:**
- One source for document shapes: the zod schemas produce the JSON Schema, validate changesets, and type the code.
- Changesets are a front end over the existing services' rules, not a second implementation of sidecar writing.
- MCP is a thin adapter over the same functions the REST routes use; no logic exists only in MCP.

**Non-Goals:**
- OAuth 2.1 authorization for MCP (clients send a personal token in a header; Claude Desktop/Code and most clients support custom headers). Can be added later as a login plugin.
- A stdio transport or separate `paloma-mcp` process.
- Changing folders or tags as objects (renaming a folder on disk, renaming a tag everywhere). A tag rename can be done with a changeset (`tags: {add, remove}`) on the tag's photos.
- Writing anything into photo files (EXIF/XMP), moving or deleting files.
- Selecting photos for a change by filter inside the changeset (`where`); the client searches first and passes ids. This keeps every changed object explicit and bounded.
- MCP prompts, sampling, subscriptions or server-sent notifications; AI runs are polled with `get_ai_run`.
- Changing AI task configuration or plugins through MCP (`plugins.manage` stays a UI/REST concern).

## Decisions

### 1. Module layout

```
server/src/model/
  documents.ts      buildPhotoDocs(ids), buildAlbumDoc, buildPersonDoc, folder/tag docs; list + get
  schemas.ts        zod schemas of documents and changesets, with .describe() texts
  jsonSchema.ts     zod → JSON Schema 2020-12 + edit-step definitions from the active filters
  guide.ts          guide Markdown (static text in guide.md + generated filter list)
  changes/
    parse.ts        shape validation, refs, limits, read-only detection
    plan.ts         resolve ids, access, permissions, compute per-object diffs (no writes)
    apply.ts        execute the plan through the existing services, folder by folder
server/src/mcp/
  server.ts         McpServer factory per request, tools + resources
  tools.ts          tool definitions → model/ and existing services
  route.ts          /api/mcp route: enable flag, origin check, token-only auth, transport
```

Routes `GET /api/objects/:type`, `GET /api/objects/:type/:id`, `GET /api/schema`, `GET /api/schema/guide`, `POST /api/changes` go into a new `server/src/routes/model.ts` mounted from `routes/index.ts`.

### 2. Documents are built from the same queries as existing responses

Photo documents are built from `listPhotos`/`getApiPhoto` rows plus album names (`shownAlbumTexts`), faces from the face tables and detected faces as in `getPhotoInfo` — batched with `chunked()` for lists, never one query per photo. Field renames (`isStarred → star`, `keywords → tags`, `latitude/longitude → location`, `filename → fileName`, `dateTaken → takenAt`, `edits: null → []`) happen only in `documents.ts`. Rejected: changing the existing `Photo` type — the web client depends on it, and the document is a public contract that should not move with UI needs.

`total` for photos reuses the count of `photoStats` (same `PhotoFilterQuery`), for other types the list length after the access filter.

### 3. Schema and descriptions

zod schemas carry `.describe()` texts; `zod-to-json-schema` is not needed because zod 3.25 ships `zod/v4` with `z.toJSONSchema()` — the model schemas are written with `zod/v4` (the MCP SDK accepts it). Read-only properties are marked by a `.meta({ readOnly: true })`. The edit-step definition is built at request time: `oneOf` one object schema per active filter (`const` `filter`, typed params with `minimum`/`maximum`/`enum`/`default`, `rect` as the relative-rectangle def) plus a fallback `{ filter: string }` with `additionalProperties: true`. Descriptions are in English only (the schema targets AI, not UI users; localization spec covers UI texts). A test validates generated documents against the generated schema with `ajv` (dev dependency).

Rejected: hand-written JSON Schema file — would drift from the validation code.

### 4. Changeset processing: parse → plan → apply

- **parse**: zod validation of the envelope and each change; a `set` key that exists on the document but is read-only → `read_only_field`; unknown key → `invalid_field`; refs: `^[A-Za-z0-9_-]{1,64}$`, unique, defined before use. Limits 1 000 changes / 5 000 named objects.
- **plan**: resolves ids against the library under the caller's access (unseen = 404), resolves `@ref`, checks permissions per field group (spec table), validates values with the existing validators (`validateChain` with the registry lookup, `personValidation`, keyword normalization, location check), simulates each change on an in-memory copy of the affected objects' current values so later changes see earlier ones, and computes diffs. Objects whose values do not change are dropped. All errors carry `{ index, field?, permission? }` and use existing `apiError` codes plus `read_only_field`.
- **dry run** returns the plan's results; created objects keep `"@ref"` (or `"@<index>"` without a ref) as their id.
- **apply** executes the plan in order. To keep the "unreadable sidecar anywhere → 409, nothing written" rule across the whole changeset, apply first reads every affected folder's sidecar state (`getFolderState`) under the folder locks, in sorted order, before writing; then writes. Photo field changes for the same folder are merged into one sidecar write per folder per change, through the same entry-patch helpers that `updatePhoto`, `changePhotosKeywords` and `setPhotosLocation` use (refactored out of those functions where they are currently inline). Album and person operations call `createAlbumFromPhotos`, `editAlbumProperties`, `add/removeAlbumPhotos`, `deleteAlbumEverywhere`, `createPerson`, `updatePerson`, `deletePerson`, `addPersonToPhoto`, `removePersonFromPhoto` with already-validated bodies.
- A failure after some writes returns 207-style body with HTTP 500 and `notChangedFolders`, as the existing bulk endpoints do (`partial_save` code), plus the results of the changes that were applied.

Rejected: one SQL transaction around the whole changeset — sidecars are the source of truth and files cannot join a DB transaction; the per-folder rule is already the project's consistency contract.

### 5. MCP transport and lifecycle

- `StreamableHTTPServerTransport` in **stateless** mode (`sessionIdGenerator: undefined`), `enableJsonResponse: true`: each POST creates an `McpServer` + transport, handles one JSON-RPC message batch and closes. No server-side session store, works behind the same rate limit and auth middleware, survives restarts. GET (SSE stream) and DELETE answer 405 as the SDK does in stateless mode. Rejected: stateful sessions — nothing we offer needs server-initiated messages.
- The route is mounted at `/api/mcp` after `authenticate()` and `rateLimit()`, so the principal, library access (AsyncLocalStorage) and quota apply unchanged. Its guard is a new `need('authenticated', { tokenOnly: true })` option: with auth on, a principal with `via === 'session'` gets 401 + `WWW-Authenticate: Bearer realm="paloma"`; with auth off it passes. `guards.test.ts` stays green.
- `express.json` already parses the body; the transport receives `req.body` as `parsedBody`.
- **Origin check** before the transport: if `Origin` is present and not equal to `config.auth.clientOrigin` or the request's own origin (`${req.protocol}://${req.get('host')}`), respond 403 `origin_not_allowed`. This also covers auth-off mode, where DNS-rebinding would otherwise let any page drive the API (the SDK's own `allowedOrigins`/`allowedHosts` options are set to the same list).
- `PALOMA_MCP` is parsed in `config.ts` like `PALOMA_AUTH` (`on`/`off`, default `on`, otherwise throw).

### 6. Tools

| Tool | Permission (listed when) | Backed by |
| :--- | :--- | :--- |
| `describe_model` | `library.view` | guide + JSON Schema |
| `search_photos` | `library.view` | `documents.listPhotoDocs` |
| `list_objects`, `get_objects` | `library.view` | `documents` |
| `library_stats` | `library.view` | `photoStats` |
| `view_photo` | `library.view` | `RenderService` + `photoImages` (preview cache when no `edits`) |
| `apply_changes` | any of `photos.edit`, `albums.manage`, `people.manage` | `model/changes` |
| `list_ai_tasks`, `start_ai_run`, `get_ai_run`, `cancel_ai_run` | `ai.run` | `ai/tasks`, `ai/runner` |
| `export_photos` | `export` | export logic extracted from the `/export` route into `services/exportApi.ts` |

- Tools are registered per request after reading the principal's permissions, so `tools/list` shows only allowed tools; handlers check again (defence in depth).
- Results: structured JSON in a `text` content item (and `structuredContent` with an `outputSchema` for the document-returning tools); `view_photo` adds an `image` item (`image/jpeg`, base64). Errors: `isError: true` with JSON `{ code, message, index?, field?, permission? }` taken from the same `apiError` objects REST returns.
- `view_photo` size limits (64–1600, default 1024) keep a single response below ~1 MB base64 at JPEG quality 80.

### 7. Files touched in photo folders

- Read: `.paloma.json` and the Picasa `.ini` of folders whose objects are read or changed (as today); photo files for `view_photo` and `export_photos` (decoded by sharp, never written).
- Written: only `<folder>/.paloma.json` of folders with changed photo entries, album definitions or people, with the existing atomic temp-file-and-rename write. No other file in photo folders is created or changed. Thumbnails/previews go to the cache dir; exports to the export dir.

### 8. MVP code reused, rewritten, dropped

- Reused as is: all services listed in Context, `RenderService`, auth middleware, rate limit, `apiError`, `saveFolderByFolder`, `withFolderLock`.
- Refactored (behaviour unchanged, covered by existing tests): per-entry patch helpers extracted from `photoApi.updatePhoto` / `changePhotosKeywords` / `setPhotosLocation` so a changeset can merge several fields into one folder write; export body extracted from `routes/index.ts` into `services/exportApi.ts`.
- New: `server/src/model/`, `server/src/mcp/`, `routes/model.ts`.
- Dropped: nothing.

## Risks / Trade-offs

- [An AI makes a large unwanted change] → dry-run results with before/after, explicit ids only (no `where`), 5 000-object cap, the guide tells the AI to dry-run first; sidecars are plain JSON in folders the user already backs up. No server-side undo in this change.
- [Token leaks give an AI client photo access] → existing token scoping (subset of permissions, expiry, revoke); `docs/mcp.md` recommends a dedicated token per client with only the needed permissions.
- [Auth off + MCP on exposes changes to anyone who can reach the port] → same exposure as the REST API today; the origin check blocks browser-based attacks; `PALOMA_MCP=off` is documented.
- [Photos are sent to a third-party AI through `view_photo`] → only when the client asks; documented in the guide and `docs/mcp.md`.
- [Stateless mode re-creates the MCP server per request] → cheap (tool registration only); schema generation is cached and invalidated when plugins change.
- [zod v4 API inside the zod 3.25 package plus an implicit dependency] → declare `zod` explicitly in `server/package.json` at the installed version.
- [Simulated plan diverges from what the services write] → tests compare dry-run results with the sidecar after applying the same changeset.

## Migration Plan

Additive: new endpoints and an `.env` flag defaulting to `on`. Rollback is `PALOMA_MCP=off` (MCP only) or reverting the change; no data migration, no new DB tables.
