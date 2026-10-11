import type { z } from 'zod/v4';
import { apiError } from '../../services/apiError.js';
import { changeSchemas, documentSchemas, MAX_CHANGES, MAX_OBJECTS, REF } from '../schemas.js';
import type { ApiError, ApiErrorCode, ChangeableType } from '../../../../shared/types.js';

// Checking the shape of a changeset: everything that does not need the library.

export type ChangeOp = 'create' | 'update' | 'delete';

/** A change whose shape is valid; ids may still be `@ref`s and unknown. */
export interface ParsedChange {
  index: number;
  op: ChangeOp;
  type: ChangeableType;
  ref?: string;
  /** The named objects, without duplicates; empty for a create */
  ids: (number | string)[];
  set: Record<string, unknown>;
}

export interface ParsedChangeset {
  changes: ParsedChange[];
  dryRun: boolean;
}

/** A rejected changeset: the status and the error body naming the change and the field or permission. */
export interface ChangeFailure {
  status: 400 | 403 | 404 | 409 | 500;
  body: ApiError;
}

export function failure(
  status: ChangeFailure['status'], code: ApiErrorCode, message: string, params: { index?: number; field?: string; permission?: string; [key: string]: string | number | undefined } = {},
): ChangeFailure {
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as Record<string, string | number>;
  const where = clean.index !== undefined ? `Change ${clean.index}${clean.field ? `, ${clean.field}` : ''}: ` : '';
  return { status, body: apiError(code, `${where}${message}`, clean) };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const CHANGEABLE: readonly ChangeableType[] = ['photo', 'album', 'person'];
const OPS: readonly ChangeOp[] = ['create', 'update', 'delete'];

/** The first problem zod found, as the field it is about and a message. */
function firstIssue(error: z.ZodError): { field: string; message: string } {
  const issue = error.issues[0];
  const path = issue.path.map(String);
  if (issue.code === 'unrecognized_keys' && issue.keys.length > 0) path.push(issue.keys[0]);
  const field = (path[0] === 'set' ? path.slice(1) : path).join('.') || (path[0] ?? 'change');
  return { field, message: issue.message };
}

/** Refs used where an album or person id is expected: in ids, and in photo albums and people. */
function refsUsed(change: ParsedChange): { ref: string; field: string }[] {
  const used: { ref: string; field: string }[] = [];
  const note = (value: unknown, field: string) => {
    if (typeof value === 'string' && value.startsWith('@')) used.push({ ref: value, field });
  };
  for (const id of change.ids) note(id, 'ids');
  if (change.type === 'photo') {
    for (const field of ['albums', 'people']) {
      const value = change.set[field];
      const items = Array.isArray(value) ? value : isObject(value) ? [...(Array.isArray(value.add) ? value.add : []), ...(Array.isArray(value.remove) ? value.remove : [])] : [];
      for (const item of items) note(isObject(item) ? item.person : item, field);
    }
  }
  return used;
}

/** Checks the shape of a changeset (`POST /api/changes`, MCP `apply_changes`) without looking at the library. */
export function parseChangeset(body: unknown): ParsedChangeset | ChangeFailure {
  if (!isObject(body)) return failure(400, 'invalid_body', 'Body must be a JSON object with "changes"');
  for (const key of Object.keys(body)) {
    if (key !== 'changes' && key !== 'dryRun') return failure(400, 'invalid_field', `Unknown field ${key}`, { field: key });
  }
  if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') return failure(400, 'invalid_field', 'dryRun must be a boolean', { field: 'dryRun' });
  const list = body.changes;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_CHANGES) {
    return failure(400, 'invalid_field', `changes must be a list of 1 to ${MAX_CHANGES} changes`, { field: 'changes' });
  }

  const changes: ParsedChange[] = [];
  const defined = new Set<string>();
  let named = 0;
  for (const [index, raw] of list.entries()) {
    if (!isObject(raw)) return failure(400, 'invalid_field', 'A change must be an object', { index, field: 'change' });
    const { op, type } = raw;
    if (type === 'folder' || type === 'tag') return failure(400, 'read_only_field', `${type} objects cannot be changed`, { index, field: 'type' });
    if (!CHANGEABLE.includes(type as ChangeableType)) return failure(400, 'invalid_field', 'type must be photo, album or person', { index, field: 'type' });
    if (!OPS.includes(op as ChangeOp)) return failure(400, 'invalid_field', 'op must be create, update or delete', { index, field: 'op' });
    const schemas = changeSchemas[op as ChangeOp] as Partial<Record<ChangeableType, z.ZodObject>>;
    const schema = schemas[type as ChangeableType];
    if (!schema) return failure(400, 'invalid_field', `Cannot ${op} a ${type}`, { index, field: 'op' });

    // A key the change cannot set: read-only if the document has it, else unknown
    if (isObject(raw.set)) {
      const setShape = (schema.shape.set as z.ZodObject | undefined)?.shape ?? {};
      const documentShape = documentSchemas[type as ChangeableType].shape as Record<string, unknown>;
      for (const key of Object.keys(raw.set)) {
        if (key in setShape) continue;
        return key in documentShape
          ? failure(400, 'read_only_field', `${key} cannot be changed`, { index, field: key })
          : failure(400, 'invalid_field', `${type} has no attribute ${key} that can be set`, { index, field: key });
      }
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const { field, message } = firstIssue(parsed.error);
      return failure(400, 'invalid_field', message, { index, field });
    }
    const value = parsed.data as { ref?: string; id?: number | string; ids?: (number | string)[]; set?: Record<string, unknown> };

    if (op === 'create') {
      if (value.id !== undefined || value.ids !== undefined) return failure(400, 'invalid_field', 'A create names no objects', { index, field: 'id' });
    } else if ((value.id === undefined) === (value.ids === undefined)) {
      return failure(400, 'invalid_field', 'Name the objects with either id or ids', { index, field: 'ids' });
    }
    if (op === 'update' && Object.keys(value.set ?? {}).length === 0) {
      return failure(400, 'invalid_field', 'set must name at least one attribute', { index, field: 'set' });
    }

    const change: ParsedChange = {
      index, op: op as ChangeOp, type: type as ChangeableType,
      ids: [...new Set(value.ids ?? (value.id !== undefined ? [value.id] : []))],
      set: value.set ?? {},
      ...(value.ref !== undefined ? { ref: value.ref } : {}),
    };
    for (const { ref, field } of refsUsed(change)) {
      if (!REF.test(ref)) return failure(400, 'invalid_field', `${ref} is not a valid reference`, { index, field });
      if (!defined.has(ref)) return failure(400, 'invalid_field', `${ref} is used before the change that creates it`, { index, field });
    }
    if (change.ref !== undefined) {
      if (defined.has(`@${change.ref}`)) return failure(400, 'invalid_field', `The ref ${change.ref} is defined twice`, { index, field: 'ref' });
      defined.add(`@${change.ref}`);
    }

    named += op === 'create' ? 1 + (Array.isArray(change.set.photos) ? change.set.photos.length : 0) : change.ids.length;
    if (named > MAX_OBJECTS) return failure(400, 'invalid_field', `A changeset may name at most ${MAX_OBJECTS} objects`, { index, field: 'ids' });
    changes.push(change);
  }
  return { changes, dryRun: body.dryRun === true };
}

/** Whether a parse result is a failure. */
export const isFailure = (value: unknown): value is ChangeFailure =>
  isObject(value) && typeof value.status === 'number' && isObject(value.body) && 'code' in value.body;
