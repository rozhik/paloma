import { z } from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Principal } from '../auth/principal.js';
import { HttpError, apiError } from '../services/apiError.js';
import { photoStats } from '../services/photoStats.js';
import { renderPreview } from '../services/renderApi.js';
import { startExport } from '../services/exportApi.js';
import { listAiTasks } from '../ai/config.js';
import { startAiRun } from '../ai/runner.js';
import { cancelTask, describeTask, listTasks } from '../tasks/api.js';
import { isOwn } from '../tasks/permissions.js';
import { taskQueue, type TaskRecord } from '../tasks/queue.js';
import { getDocuments, listDocuments, OBJECT_TYPES, photoDocumentsById } from '../model/documents.js';
import { modelSchema } from '../model/jsonSchema.js';
import { aiGuide } from '../model/guide.js';
import { runChangeset } from '../model/changes/apply.js';
import { MAX_CHANGES, MAX_EDIT_STEPS } from '../model/schemas.js';
import type { PhotoFilterQuery } from '../services/photoFilters.js';
import { redactPaths } from '../services/redact.js';
import type { ApiError, ExportTaskDetails, ObjectList, ObjectType, Permission } from '../../../shared/types.js';
import { withImages, type ImageLinks } from './images.js';
import { MAX_VIEW_SIZE, MIN_VIEW_SIZE } from './media.js';

// The MCP tools: thin adapters over the functions the REST routes use, each needing the permission of the
// matching endpoint. Every argument is bounded, no result carries a server path, and images come with
// temporary links (never for hidden photos).

/** A tool of the Paloma MCP server. */
export interface PalomaTool {
  name: string;
  title: string;
  description: string;
  /** Listed and callable with any of these permissions */
  permissions: Permission[];
  readOnly: boolean;
  input: z.ZodRawShape;
  run(args: Record<string, unknown>, principal: Principal, links: ImageLinks): Promise<CallToolResult>;
}

/** The value with every absolute server path in its strings replaced by `<path>` (a second line of defence). */
export function redactValue<T>(value: T): T {
  if (typeof value === 'string') return redactPaths(value) as T;
  if (Array.isArray(value)) return value.map(redactValue) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)])) as T;
  }
  return value;
}

/** A tool result with a JSON value, as text and as structured content. */
export function jsonResult(value: unknown): CallToolResult {
  const safe = redactValue(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(safe, null, 2) }],
    ...(typeof safe === 'object' && safe !== null && !Array.isArray(safe) ? { structuredContent: safe as Record<string, unknown> } : {}),
  };
}

/** A tool error with the same error body the REST API sends. */
export function errorResult(body: ApiError): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(redactValue(body)) }] };
}

/** Limits of tool arguments (mcp-server capability: tool arguments have size limits). */
export const MAX_QUERY = 500;
export const MAX_ID_TEXT = 100;
export const MAX_OUTPUT_DIR = 200;
export const MAX_PHOTO_IDS = 1000;
export const MAX_GET_IDS = 200;
export const MAX_JSON_BYTES = 64 * 1024;
export const MAX_RESIZE_WIDTH = 10000;

const jsonBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value) ?? '');
const withinBytes = <T extends z.ZodType>(schema: T, what: string) =>
  schema.refine((value) => jsonBytes(value) <= MAX_JSON_BYTES, { message: `${what} must be at most ${MAX_JSON_BYTES / 1024} KiB as JSON` });

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idText = (description: string) => z.string().max(MAX_ID_TEXT).describe(`${description}; at most ${MAX_ID_TEXT} characters`);
const photoIds = (description: string) => z.array(z.number().int().positive()).min(1).max(MAX_PHOTO_IDS).describe(`${description}; 1 to ${MAX_PHOTO_IDS} ids`);

/** The photo selection of `GET /api/photos`, as tool arguments. */
const selection = {
  folderId: z.number().int().optional().describe('Only photos of this folder (folder id)'),
  album: idText('Only photos of this album (album token)').optional(),
  tag: idText('Only photos with this tag, ignoring letter case').optional(),
  person: idText('Only photos showing this person (contact id)').optional(),
  query: z.string().max(MAX_QUERY).optional().describe(`Search text, at most ${MAX_QUERY} characters: every word must occur in the file name, folder name, caption, tags, camera, place, album names or people's names`),
  starred: z.boolean().optional().describe('true: only starred photos'),
  geotagged: z.boolean().optional().describe('true: only photos with a location; false: only photos without one'),
  takenFrom: date.optional().describe('Only photos taken on or after this day (YYYY-MM-DD)'),
  takenTo: date.optional().describe('Only photos taken on or before this day (YYYY-MM-DD)'),
  includeHidden: z.boolean().optional().describe('true: include hidden photos, which are left out otherwise'),
};

function filterQuery(args: Record<string, unknown>): PhotoFilterQuery {
  const query: PhotoFilterQuery = {};
  if (args.folderId !== undefined) query.folderId = String(args.folderId);
  for (const key of ['album', 'tag', 'person', 'query', 'takenFrom', 'takenTo'] as const) if (args[key] !== undefined) query[key] = args[key];
  if (args.starred === true) query.starred = 'true';
  if (args.geotagged !== undefined) query.geotagged = String(args.geotagged);
  if (args.includeHidden === true) query.includeHidden = 'true';
  return query;
}

const objectType = z.enum(OBJECT_TYPES as [ObjectType, ...ObjectType[]]).describe('Kind of object: photo, album, person, folder or tag');

const LINKS_NOTE = 'Photos that are not hidden come with images.thumbnail.url and images.preview.url: temporary links that need no token and stop working after uri_valid_time_sec seconds.';

/** A list of documents with links to the images of its photos and how long they stay valid. */
const listWithImages = <T extends { items: ObjectList['items'] }>(list: T, links: ImageLinks) =>
  ({ ...list, items: withImages(list.items, links), uri_valid_time_sec: links.validSec });

export const TOOLS: PalomaTool[] = [
  {
    name: 'describe_model',
    title: 'Describe the photo library model',
    description: 'Returns the guide for AI clients (object types, ids, how to search and how to change things safely) and the JSON Schema of every object and of a changeset. Read it before changing anything.',
    permissions: ['library.view'],
    readOnly: true,
    input: {},
    run: async () => ({
      content: [
        { type: 'text', text: aiGuide() },
        { type: 'text', text: JSON.stringify(modelSchema()) },
      ],
    }),
  },
  {
    name: 'search_photos',
    title: 'Search photos',
    description: `Finds photos by folder, album, tag, person, text, star, location and date, newest first. Returns photo documents and the total number of matches. ${LINKS_NOTE}`,
    permissions: ['library.view'],
    readOnly: true,
    input: {
      ...selection,
      limit: z.number().int().min(1).max(200).optional().describe('Photos to return, 1 to 200 (default 50)'),
      offset: z.number().int().min(0).optional().describe('Matches to skip, for paging (default 0)'),
    },
    run: async (args, principal, links) => jsonResult(listWithImages(await listDocuments('photo', filterQuery(args), {
      limit: (args.limit as number | undefined) ?? 50, offset: (args.offset as number | undefined) ?? 0,
    }), links)),
  },
  {
    name: 'list_objects',
    title: 'List objects',
    description: 'Lists albums, people, folders or tags (or photos, newest first) as documents, with the total number.',
    permissions: ['library.view'],
    readOnly: true,
    input: {
      type: objectType,
      limit: z.number().int().min(1).max(200).optional().describe('Objects to return, 1 to 200 (default 100)'),
      offset: z.number().int().min(0).optional().describe('Objects to skip (default 0)'),
    },
    run: async (args, principal, links) => {
      const list = await listDocuments(args.type as ObjectType, {}, {
        limit: (args.limit as number | undefined) ?? 100, offset: (args.offset as number | undefined) ?? 0,
      });
      return jsonResult(args.type === 'photo' ? listWithImages(list, links) : list);
    },
  },
  {
    name: 'get_objects',
    title: 'Get objects',
    description: `Returns the documents of up to ${MAX_GET_IDS} objects of one type by id, and lists the ids that were not found. Hidden photos count as not found unless includeHidden is true. ${LINKS_NOTE}`,
    permissions: ['library.view'],
    readOnly: true,
    input: {
      type: objectType,
      ids: z.array(z.union([z.number(), z.string().max(MAX_ID_TEXT)])).min(1).max(MAX_GET_IDS)
        .describe(`Ids of the objects, 1 to ${MAX_GET_IDS}: photo and folder ids are numbers, album tokens, contact ids and tags are strings of at most ${MAX_ID_TEXT} characters`),
      includeHidden: z.boolean().optional().describe('true: also return hidden photos (without image links); they count as not found otherwise'),
    },
    run: async (args, principal, links) => {
      const found = await getDocuments(args.type as ObjectType, args.ids as (string | number)[], { includeHidden: args.includeHidden === true });
      return jsonResult(args.type === 'photo' ? listWithImages(found, links) : found);
    },
  },
  {
    name: 'library_stats',
    title: 'Library statistics',
    description: 'Totals over every photo of a selection: count, size, date range, starred, located and edited counts, and the folders, albums and people the photos belong to.',
    permissions: ['library.view'],
    readOnly: true,
    input: selection,
    run: async (args) => jsonResult(await photoStats(filterQuery(args))),
  },
  {
    name: 'view_photo',
    title: 'View a photo',
    description: 'Returns a photo as a JPEG image you can look at, rendered through its saved edits, with its document and a temporary link to the same image '
      + '(image.url, valid for uri_valid_time_sec seconds, no token needed). Give "edits" to see a different edit chain without saving it; such an image gets no link. '
      + 'Hidden photos are not shown. The image is sent to you; use it only when needed.',
    permissions: ['library.view'],
    readOnly: true,
    input: {
      id: z.number().int().positive().describe('Photo id'),
      maxSize: z.number().int().min(MIN_VIEW_SIZE).max(MAX_VIEW_SIZE).optional().describe(`Longest side of the image in pixels, ${MIN_VIEW_SIZE} to ${MAX_VIEW_SIZE} (default 1024)`),
      edits: withinBytes(z.array(z.record(z.string(), z.unknown())).max(MAX_EDIT_STEPS), 'edits').optional()
        .describe(`An edit chain of at most ${MAX_EDIT_STEPS} steps to render instead of the saved one; nothing is saved`),
    },
    run: async (args, principal, links) => {
      const [document] = await photoDocumentsById([args.id as number], { includeHidden: false });
      // A hidden photo is not served at all, whatever is asked
      if (!document) return errorResult(apiError('object_not_found', `No photo ${args.id}`, { type: 'photo', id: args.id as number }));
      const maxSize = (args.maxSize as number | undefined) ?? 1024;
      const image = await renderPreview(document.id, { edits: args.edits ?? document.edits, maxSize }, 'jpeg');
      if (image.status !== 200) return errorResult(image.body);
      if (image.kind !== 'buffer') return errorResult(apiError('render_failed', 'Could not render the photo'));
      const unsaved = args.edits !== undefined;
      const [shown] = withImages([document], links);
      const result = {
        ...shown,
        image: unsaved ? null : links.link(document, maxSize) ?? null,
        ...(unsaved ? { imageNote: 'Rendered with unsaved edits: this image has no link' } : {}),
        uri_valid_time_sec: links.validSec,
      };
      return {
        content: [
          { type: 'image', data: image.image.toString('base64'), mimeType: 'image/jpeg' },
          { type: 'text', text: JSON.stringify(redactValue(result), null, 2) },
        ],
      };
    },
  },
  {
    name: 'apply_changes',
    title: 'Change photos, albums and people',
    description: 'Applies a changeset: an ordered list of create, update and delete operations on photos, albums and people (see describe_model). '
      + 'Everything is checked before anything is written; with dryRun nothing is written. Returns, for every changed object, each attribute before and after. '
      + 'Only .paloma.json files in the photo folders are written; photo files are never changed.',
    permissions: ['photos.edit', 'albums.manage', 'people.manage'],
    readOnly: false,
    input: {
      changes: z.array(withinBytes(z.record(z.string(), z.unknown()), 'A change')).min(1).max(MAX_CHANGES)
        .describe(`The changes, 1 to ${MAX_CHANGES}, each at most ${MAX_JSON_BYTES / 1024} KiB as JSON, as the Changeset definition of the schema describes them: {"op", "type", "id" or "ids", "ref", "set"}`),
      dryRun: z.boolean().optional().describe('true: check and return what would change without writing anything. Use it before large changes'),
    },
    run: async (args, principal) => {
      const result = await runChangeset({ changes: args.changes, ...(args.dryRun !== undefined ? { dryRun: args.dryRun } : {}) }, principal);
      return result.status === 200 ? jsonResult(result.body) : errorResult(result.body);
    },
  },
  {
    name: 'list_ai_tasks',
    title: 'List AI tasks',
    description: 'Lists the AI tasks (tags, objects, descriptions and custom ones) with whether each is ready to run.',
    permissions: ['ai.run'],
    readOnly: true,
    input: {},
    run: async () => jsonResult({ tasks: await listAiTasks() }),
  },
  {
    name: 'start_ai_run',
    title: 'Run an AI task on photos',
    description: 'Adds a run of an AI task on photos to the server task queue: the photos are sent to the configured AI service, and tags and descriptions are added. Runs wait for the tasks ahead of them; follow one with get_ai_run and its task id.',
    permissions: ['ai.run'],
    readOnly: false,
    input: {
      taskId: idText('Task id from list_ai_tasks'),
      photoIds: photoIds('Photos to process'),
      again: z.boolean().optional().describe('true: also process photos already processed with the same task settings'),
    },
    run: async (args, principal) => jsonResult(await describeTask(principal,
      await startAiRun({ taskId: args.taskId, photoIds: args.photoIds, again: args.again }, 'en', principal))),
  },
  {
    name: 'get_ai_run',
    title: 'AI run progress',
    description: 'Returns an AI run task with its state and progress, and to its owner what it did so far: the run with the given task id, or your most recent run.',
    permissions: ['ai.run'],
    readOnly: true,
    input: {
      taskId: idText('Task id returned by start_ai_run; leave out for your most recent run').optional(),
    },
    run: async (args, principal) => {
      const task = await aiRunTask(args.taskId, principal, false);
      return jsonResult(task ? await describeTask(principal, task) : { task: null });
    },
  },
  {
    name: 'cancel_ai_run',
    title: 'Cancel an AI run',
    description: 'Cancels an AI run task: a waiting one at once, a running one after the photos being processed. Another user\'s run needs users.manage.',
    permissions: ['ai.run'],
    readOnly: false,
    input: {
      taskId: idText('Task id returned by start_ai_run; leave out for your most recent run that has not ended').optional(),
    },
    run: async (args, principal) => {
      const task = await aiRunTask(args.taskId, principal, true);
      if (!task) return errorResult(apiError('task_not_found', 'You have no AI run to cancel'));
      return jsonResult(await cancelTask(principal, task.id) ?? { task: null });
    },
  },
  {
    name: 'list_tasks',
    title: 'Task queue',
    description: 'Lists the server task queue: the running task, waiting and paused tasks in order, then recently ended tasks. Other users\' tasks show who started them but not their photos.',
    permissions: ['library.view'],
    readOnly: true,
    input: {},
    run: async (args, principal) => jsonResult(await listTasks(principal)),
  },
  {
    name: 'export_photos',
    title: 'Export photos',
    description: 'Writes the photos, rendered through their edits, as JPEG files into a folder inside your export folder. The export runs as a task in the queue; the tool returns when it has ended, with the written files relative to the export folder.',
    permissions: ['export'],
    readOnly: false,
    input: {
      photoIds: photoIds('Photos to export'),
      outputDir: z.string().min(1).max(MAX_OUTPUT_DIR).describe(`Folder inside the export folder, e.g. "trip-2024"; at most ${MAX_OUTPUT_DIR} characters`),
      quality: z.number().int().min(1).max(100).optional().describe('JPEG quality 1 to 100 (default 85)'),
      resizeWidth: z.number().int().positive().max(MAX_RESIZE_WIDTH).optional().describe(`Width in pixels to resize to, at most ${MAX_RESIZE_WIDTH}; leave out to keep the full size`),
    },
    run: async (args, principal) => {
      const task = await startExport(args, principal);
      const ended = await taskQueue.whenEnded(task.id);
      const details = ended.details as ExportTaskDetails;
      return jsonResult({
        state: ended.state, count: details.files.length, requested: (args.photoIds as number[]).length,
        ...(details.quotaExceeded ? { quotaExceeded: true } : {}), files: details.files,
      });
    },
  },
];

/**
 * The AI run task with `taskId`, or the principal's most recent one (`active`: only one that has not ended).
 * Undefined when there is none; an unknown id or a task of another kind is 404.
 */
async function aiRunTask(taskId: unknown, principal: Principal, active: boolean): Promise<TaskRecord | undefined> {
  if (typeof taskId === 'string') {
    const task = await taskQueue.get(taskId);
    if (task.kind !== 'ai') throw new HttpError(404, apiError('task_not_found', `Task ${taskId} is not an AI run`, { id: taskId }));
    return task;
  }
  const own = (await taskQueue.list()).filter((task) => task.kind === 'ai' && isOwn(principal, task) && (!active || !['finished', 'cancelled', 'failed'].includes(task.state)));
  return own.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Whether a principal may use a tool. */
export const mayUse = (tool: PalomaTool, principal: Principal): boolean => tool.permissions.some((permission) => principal.permissions.has(permission));

/** The arguments checked against the tool's input schema, or the `invalid_field` error naming the first bad one. */
export function parseArgs(tool: PalomaTool, args: unknown): { args: Record<string, unknown> } | { error: CallToolResult } {
  const parsed = z.object(tool.input).safeParse(args ?? {});
  if (parsed.success) return { args: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue.path.length > 0 ? String(issue.path[0]) : 'arguments';
  return { error: errorResult(apiError('invalid_field', `${field}: ${issue.message}`, { field })) };
}

/**
 * Runs a tool for a principal: refuses it without its permission or with arguments its schema refuses, and turns
 * thrown API errors into tool errors.
 */
export async function runTool(tool: PalomaTool, args: unknown, principal: Principal, links: ImageLinks): Promise<CallToolResult> {
  if (!mayUse(tool, principal)) {
    return errorResult(apiError('permission_required', `This needs the permission ${tool.permissions[0]}`, { permission: tool.permissions[0] }));
  }
  const checked = parseArgs(tool, args);
  if ('error' in checked) return checked.error;
  try {
    return await tool.run(checked.args, principal, links);
  } catch (err) {
    if (err instanceof HttpError) return errorResult(err.body);
    throw err;
  }
}
