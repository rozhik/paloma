import { activeFilters, filterStepSchema } from './jsonSchema.js';
import { MAX_CHANGES, MAX_OBJECTS } from './schemas.js';
import type { FilterInfo } from '../../../shared/types.js';

// The guide for AI clients (`GET /api/schema/guide`, MCP `paloma://guide` and `describe_model`).

const GUIDE = `# Paloma photo library — guide for AI clients

Paloma is a local photo manager (a successor to Google Picasa). You can read the library, look at photos and
change what Paloma stores about them. Photo files themselves are never changed, renamed, moved or deleted:
every change is written to the \`.paloma.json\` file in the photo's folder, which other Paloma users and
backups see.

## Objects and ids

| type | id | can be changed |
| :--- | :--- | :--- |
| \`photo\` | number | star, hidden, caption, tags, location, albums, people, edits |
| \`album\` | token (string) | name, description, location, cover; create, delete |
| \`person\` | contact id (16 hex digits) | name, alias, comment, links, birth, gender; create, delete |
| \`folder\` | number | read-only |
| \`tag\` | the tag as shown | read-only (change the tags of photos instead) |

Every object is one JSON document with \`type\` and \`id\`. The JSON Schema (\`paloma://schema\`,
\`GET /api/schema\`) describes every attribute; attributes marked \`readOnly\` cannot be set. Photo ids are
valid in this library; \`folder.id\` + \`fileName\` name the file. Server paths are never shown.

## Finding photos

Search with these parameters (all optional, combined with AND):
\`folderId\`, \`album\` (token), \`tag\`, \`person\` (contact id), \`query\` (every word must occur in the file
name, folder, caption, tags, camera, place, album names or people's names), \`starred\` ("true"),
\`geotagged\` ("true" / "false"), \`takenFrom\` / \`takenTo\` (YYYY-MM-DD), \`includeHidden\` ("true").
Hidden photos are left out unless \`includeHidden\` is "true". Results are newest first and paged with
\`limit\` and \`offset\`; \`total\` counts all matches. Use statistics to get counts without listing photos.

To look at a photo, ask for its image (MCP: \`view_photo\`). The image shows the photo with its saved edits.
Images are sent to you, the AI client: do this only when needed.

## Changing objects: changesets

Send one changeset with an ordered list of changes (MCP: \`apply_changes\`, REST: \`POST /api/changes\`):

\`\`\`json
{
  "dryRun": true,
  "changes": [
    { "op": "create", "type": "album", "ref": "trip", "set": { "name": "Carpathians 2024", "photos": [12, 15] } },
    { "op": "update", "type": "photo", "ids": [12, 15, 18], "set": {
        "star": true,
        "caption": "Sunrise on Hoverla",
        "tags": { "add": ["mountains", "sunrise"], "remove": ["untitled"] },
        "albums": { "add": ["@trip"] },
        "location": { "lat": 48.160833, "lon": 24.500278 } } },
    { "op": "create", "type": "person", "ref": "ann", "set": { "name": "Ann" } },
    { "op": "update", "type": "photo", "id": 18, "set": { "people": { "add": ["@ann"] } } },
    { "op": "update", "type": "album", "id": "c9ea9fa67022f38a3c771894d2a8a468", "set": { "description": "Spring migration" } }
  ]
}
\`\`\`

- \`op\` is \`create\`, \`update\` or \`delete\`; \`type\` is \`photo\`, \`album\` or \`person\`. Photos cannot be created
  or deleted. Name the objects with \`id\` or \`ids\`.
- List attributes (\`tags\`, \`albums\`, \`people\`) take an array, which replaces the list, or
  \`{"add": [...], "remove": [...]}\`, which adjusts it. Tags are compared ignoring letter case.
- To assign a face found by face detection, add \`{"person": "<contact id>", "face": <detectedFaces id>}\`.
- \`"ref"\` names an object created in the changeset; later changes use \`"@<ref>"\` as its id.
- \`caption: ""\` removes the description; \`location: null\` removes the location; \`edits: []\` removes all edits.
- At most ${MAX_CHANGES} changes naming at most ${MAX_OBJECTS} objects.

Everything is checked before anything is written. An error names the change (\`index\`) and the \`field\`
or the missing \`permission\`, and nothing is changed. The result lists, for every object whose values change,
each attribute with \`from\` and \`to\`.

## Rules

1. Read the documents before changing them, and change only what the user asked for.
2. Run large or unclear changes with \`"dryRun": true\` first, show the user what would change, then apply.
3. Prefer \`add\`/\`remove\` for tags, albums and people, so values set by others are kept.
4. Do not change hidden photos unless the user asked about them.
5. You can do only what your token's permissions allow; tools you cannot use are not offered.

## Edit chain

\`edits\` is an ordered list of steps \`{"filter": "<name>", ...parameters}\` applied from first to last;
\`"enabled": false\` keeps a step without applying it. Rectangles and sizes are fractions 0..1 of the image,
never pixels. Steps of filters that are not available are kept and skipped. Set the whole new chain; try it
first with \`view_photo\` and \`edits\`, which renders without saving.
`;

function filterLine(filter: FilterInfo): string {
  const schema = filterStepSchema(filter) as { properties: Record<string, { description?: string }> };
  const params = Object.entries(schema.properties)
    .filter(([name]) => name !== 'filter' && name !== 'enabled')
    .map(([name, param]) => `\`${name}\` — ${param.description}`);
  return `- \`${filter.name}\` — ${filter.label}${params.length > 0 ? `. Parameters: ${params.join('; ')}` : ''}`;
}

/** The guide with the filters of the active plugins. */
export function aiGuide(): string {
  const filters = activeFilters();
  const list = filters.length > 0 ? filters.map(filterLine).join('\n') : '- none: no filter plugin is switched on';
  return `${GUIDE}\nAvailable filters:\n\n${list}\n`;
}
