# Proposal

## Why

AI assistants (Claude, ChatGPT, local agents) can already sort, tag and describe photos well, but Paloma has no way for them to work with the library: the REST API is spread over dozens of endpoint-specific bodies (`PATCH /api/photos/:id`, `POST /api/photos/keywords`, `PATCH /api/albums/:token`, `PUT /api/photos/:id/edits`, …) with no machine-readable description. An AI needs one documented JSON model of Paloma's objects, one way to change any writable attribute of them, and a standard protocol to reach them — the Model Context Protocol (MCP).

## What Changes

- **Object documents**: every library object — photo, album, person, folder, tag — gets one JSON document shape with a stable `type` and `id`. Documents are read with `GET /api/objects/:type` (with the photo-list filters for photos) and `GET /api/objects/:type/:id`.
- **Model schema with descriptions for AI**: `GET /api/schema` returns a JSON Schema (draft 2020-12) of all documents and of the changeset, where every property has an English `description` written for an AI, writable properties are distinguished from `readOnly` ones, and the edit-step part lists the filters and parameters of the active plugins. `GET /api/schema/guide` returns a short Markdown guide for AI clients (ids, how to select photos, how to change them, safety rules).
- **Changesets**: `POST /api/changes` takes one JSON changeset — an ordered list of `create`, `update` and `delete` operations on photos, albums and people — that can change every writable attribute: star, hidden, caption, tags, location, albums, people, edits of photos; name, description, location, cover of albums; profile fields of people. The whole changeset is validated and permission-checked before anything is written; `dryRun` shows the result without writing. Writes follow the existing sidecar rules (folder by folder, `.paloma.json` only).
- **MCP server**: a Streamable HTTP MCP endpoint at `/api/mcp` inside the Paloma server, authenticated with personal API tokens when auth is on. It offers tools to describe the model, search and read objects, get statistics, apply changesets, look at photos (thumbnail, preview, or a preview of unsaved edits returned as images), run AI tasks and export photos; the guide and schema are also MCP resources. Each tool needs the same permission as the matching REST endpoint, and tools the caller cannot use are not listed.
- New `.env` setting `PALOMA_MCP` (`on` by default, `off` removes the endpoint); the Server section of Server settings shows whether MCP is on and its address.
- New server dependency `@modelcontextprotocol/sdk`.

## Capabilities

### New Capabilities
- `object-model`: the JSON documents of photos, albums, people, folders and tags, the documents API, the JSON Schema with AI-oriented descriptions and the AI guide.
- `object-changes`: changesets — operations, selecting objects, validation, permission checks, dry run, saving and results.
- `mcp-server`: the MCP endpoint — enabling, transport, authentication and origin checks, tools, resources and images.

### Modified Capabilities
- `server-settings`: the Server section and the server information API show whether MCP is on and the endpoint address.

## Impact

- Server: new `server/src/model/` (document builders, zod schemas, JSON Schema and guide generation, changeset validation and application on top of the existing `photoApi`, `albumApi`, `peopleApi` and `editChain` services), new `server/src/mcp/` (MCP server, tools, resources), new routes `/api/objects`, `/api/schema`, `/api/changes`, `/api/mcp`; `config.ts` and `serverInfo.ts` gain the MCP setting.
- Dependency: `@modelcontextprotocol/sdk` (uses the `zod` 3 already installed).
- `shared/types.ts`: document, changeset and change-result types; `ServerInfo` gains `mcp`.
- Client: the Server section shows the MCP line; locale strings in all languages.
- `.env.example` and `docs/`: `PALOMA_MCP`, new `docs/mcp.md` (connecting Claude Desktop / Claude Code / other clients with a token).
- Photo folders: changesets write only `.paloma.json`, exactly as the existing endpoints do; photo files are only read (for images sent to the AI client).
- Privacy: photo previews returned by `view_photo` go to whatever AI client holds the token; `docs/mcp.md` and the guide say so.
