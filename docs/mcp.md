# MCP server and object model

Paloma describes its library as JSON documents with a published schema, changes them with one JSON
*changeset*, and offers both to AI clients (Claude Desktop, Claude Code, local agents) through the
[Model Context Protocol](https://modelcontextprotocol.io). Requirements: `openspec/specs/object-model`,
`openspec/specs/object-changes`, `openspec/specs/mcp-server`. Code: `server/src/model/`, `server/src/mcp/`.

Photo files are never changed: every change is written to the `.paloma.json` of the photo's folder, with the
same rules as the changes made in the UI.

## Object documents

| type | id | writable attributes |
| :--- | :--- | :--- |
| `photo` | photo id (number) | `star`, `hidden`, `caption`, `tags`, `location`, `albums`, `people`, `edits` |
| `album` | album token | `name`, `description`, `location`, `cover` |
| `person` | contact id (16 hex digits) | `name`, `alias`, `comment`, `links`, `birth`, `gender` |
| `folder` | folder id (number) | none |
| `tag` | the tag as shown | none |

- `GET /api/objects/:type?limit=&offset=` — a page of documents (`limit` 1–500, default 100) and `total`.
  Photos take the `GET /api/photos` parameters (`folderId`, `album`, `tag`, `person`, `query`, `starred`,
  `geotagged`, `takenFrom`, `takenTo`, `includeHidden`).
- `GET /api/objects/:type/:id` — one document; 404 `object_not_found` when it does not exist or is not visible.
- `GET /api/schema` — JSON Schema (draft 2020-12): `$defs` `PhotoDocument`, `AlbumDocument`, `PersonDocument`,
  `FolderDocument`, `TagDocument`, `Changeset`, `EditStep` (one definition per filter of the active plugins)
  and `RelativeRect`. Every property has a description written for an AI; read-only ones have `readOnly: true`.
- `GET /api/schema/guide` — the guide for AI clients (Markdown), with the available filters.

All need `library.view`.

## Changesets

`POST /api/changes` (needs any of `photos.edit`, `albums.manage`, `people.manage`; each change is checked
against the permission it needs):

<!-- changeset-example -->
```json
{
  "dryRun": true,
  "changes": [
    { "op": "create", "type": "album", "ref": "trip", "set": { "name": "Carpathians 2024", "photos": [12, 15] } },
    { "op": "update", "type": "photo", "ids": [12, 15, 18], "set": {
      "star": true,
      "tags": { "add": ["mountains"], "remove": ["untitled"] },
      "albums": { "add": ["@trip"] },
      "location": { "lat": 48.160833, "lon": 24.500278 }
    } },
    { "op": "create", "type": "person", "ref": "ann", "set": { "name": "Ann" } },
    { "op": "update", "type": "photo", "id": 18, "set": { "people": { "add": ["@ann", { "person": "b8e4117cf1d6615b", "face": 31 }] } } },
    { "op": "update", "type": "album", "id": "c9ea9fa67022f38a3c771894d2a8a468", "set": { "cover": 15, "description": "" } },
    { "op": "delete", "type": "person", "id": "0123456789abcdef" }
  ]
}
```

- **Lists** (`tags`, `albums`, `people`): an array replaces the list, `{"add", "remove"}` adjusts it.
- **Refs**: a `create` with `"ref": "x"` lets later changes use `"@x"` as the new object's id.
- **Limits**: 1–1 000 changes, at most 5 000 named objects.
- **Checks first**: the whole changeset is validated, ids resolved and permissions checked before anything is
  written. Errors: 400 (`invalid_field`, `read_only_field`, `edits_invalid`, …), 403 (`permission_required`,
  `album_not_granted`, `outside_access`), 404 (`object_not_found`, `face_not_found`) and 409
  (`sidecar_unreadable`), with `params.index` (the change) and `params.field` or `params.permission`.
- **Dry run**: `"dryRun": true` returns the same results and writes nothing.
- **Results**: one per change with `ids` and `objects` — each object whose values change, with every changed
  attribute as `{from, to}` (at most 200 per change, the rest counted in `more`). Unchanged objects are not
  written.
- **Saving**: changes are applied in order through the same services as the REST endpoints, folder by folder.
  If a folder cannot be written, the response is 500 `sidecar_write_failed` with `notChangedFolders` and the
  results of the changes applied before.

Files: only `<folder>/.paloma.json` of the folders whose photos, album definitions or faces change.

## MCP server

The MCP endpoint is `/api/mcp` on the API server's port (e.g. `http://localhost:3001/api/mcp`), speaking MCP
over Streamable HTTP in stateless mode (`POST` only; `GET` and `DELETE` answer 405). It is on by default;
`PALOMA_MCP=off` in `.env` removes it. Server settings → Server shows whether it is on and its address.

- **Users off** (`PALOMA_AUTH=off`): no token is needed, as for the rest of the API. Anyone who can reach the
  port can use it; set `PALOMA_MCP=off` if that is not wanted.
- **Users on**: send a personal API token, `Authorization: Bearer pal_…`. Login cookies are not accepted. Make
  a separate token for each AI client in Account → API tokens, with only the permissions it needs (e.g.
  `library.view` to let it only look; add `photos.edit` to let it tag and describe photos). Revoking the token
  disconnects the client. MCP requests count toward the token's request rate.
- Requests with an `Origin` header other than the server's own or `PALOMA_CLIENT_ORIGIN` are refused (403
  `origin_not_allowed`), so a web page cannot use a Paloma running on your computer.

### Connecting clients

Claude Code:

```sh
claude mcp add --transport http paloma http://localhost:3001/api/mcp --header "Authorization: Bearer pal_…"
```

Claude Desktop and other clients that take a JSON configuration with remote servers:

```json
{
  "mcpServers": {
    "paloma": {
      "type": "http",
      "url": "http://localhost:3001/api/mcp",
      "headers": { "Authorization": "Bearer pal_…" }
    }
  }
}
```

Clients that only start local (stdio) servers can use a bridge such as
`npx mcp-remote http://localhost:3001/api/mcp --header "Authorization: Bearer pal_…"`.

### Tools

| Tool | Permission | What it does |
| :--- | :--- | :--- |
| `describe_model` | `library.view` | The AI guide and the JSON Schema |
| `search_photos` | `library.view` | Photo documents of a selection (photo-list parameters), `limit` ≤ 200 |
| `list_objects` | `library.view` | Documents of one type |
| `get_objects` | `library.view` | Documents of up to 200 ids, and the ids not found |
| `library_stats` | `library.view` | Totals of a selection (as `GET /api/photos/stats`) |
| `view_photo` | `library.view` | The photo as a JPEG image (64–1600 px, default 1024) through its saved edits or given unsaved `edits` |
| `apply_changes` | any of `photos.edit`, `albums.manage`, `people.manage` | A changeset, optionally as a dry run |
| `list_tasks` | `library.view` | The [task queue](task-queue.md), as `GET /api/tasks` |
| `list_ai_tasks`, `start_ai_run`, `get_ai_run`, `cancel_ai_run` | `ai.run` | AI tasks; a run is added to the task queue, followed and cancelled by its task id (default: your most recent run) |
| `export_photos` | `export` | Export into the user's export folder through the task queue; returns when the export has ended, with the paths relative to the export folder |

A client sees only the tools its token allows. Errors are tool results with `isError` and the same JSON body
as the REST API (`code`, `params`). Resources: `paloma://guide` (Markdown) and `paloma://schema` (JSON).

### Privacy

`view_photo` sends the photo's pixels, and every tool sends photo metadata (captions, tags, places, people's
names), to the AI client holding the token, and through it to whatever AI service that client uses. Give a
client only the permissions and folders it needs.
