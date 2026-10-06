import { apiError } from './apiError.js';
import { isRelativeRect } from './SidecarService.js';
import type { ApiError, Gender, PersonInput } from '../../../shared/types.js';

export const MAX_NAME = 200;
export const MAX_ALIAS = 200;
export const MAX_COMMENT = 5000;
export const MAX_LINKS = 20;
export const MAX_LINK = 2000;

const GENDERS: readonly Gender[] = ['female', 'male'];

const invalidField = (field: string, expected: string): ApiError =>
  apiError('invalid_field', `${field} must be ${expected}`, { field });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An absolute `http` or `https` URL, as typed (trimmed); null for anything else. */
export function parseLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '' || text.length > MAX_LINK) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null;
  } catch {
    return null;
  }
}

/** Whether `birth` is a year (`YYYY`) or a calendar date (`YYYY-MM-DD`), from year 1000 and not after `today`. */
export function isBirth(value: string, today: Date): boolean {
  const year = /^(\d{4})$/.exec(value);
  if (year) return Number(year[1]) >= 1000 && Number(year[1]) <= today.getUTCFullYear();
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!date) return false;
  const [y, m, d] = date.slice(1).map(Number);
  const time = Date.UTC(y, m - 1, d);
  const parsed = new Date(time);
  if (y < 1000 || parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return false;
  return time <= Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
}

/** A trimmed optional text: null clears it, `''` too; an error for anything else or a text over `max`. */
function optionalText(value: unknown, field: string, max: number): string | null | ApiError {
  if (value === null) return null;
  if (typeof value !== 'string') return invalidField(field, 'a string or null');
  const text = value.trim();
  if (text.length > max) return invalidField(field, `at most ${max} characters`);
  return text === '' ? null : text;
}

/**
 * Validates a `POST /api/people` or `PATCH /api/people/:id` body. `known` says whether the person already has
 * a name (false when creating). Profile fields other than the name are only accepted for a known person or
 * together with a name. Keys that are not profile fields are ignored.
 */
export function parsePersonInput(body: unknown, known: boolean, today = new Date()): PersonInput | ApiError {
  if (!isObject(body)) return apiError('invalid_body', 'Body must be a JSON object');
  const input: PersonInput = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return invalidField('name', 'a string');
    const name = body.name.trim();
    if (name === '') return apiError('person_name_required', 'Name is required');
    if (name.length > MAX_NAME) return invalidField('name', `at most ${MAX_NAME} characters`);
    input.name = name;
  }

  for (const [field, max] of [['alias', MAX_ALIAS], ['comment', MAX_COMMENT]] as const) {
    if (body[field] === undefined) continue;
    const text = optionalText(body[field], field, max);
    if (text !== null && typeof text === 'object') return text;
    input[field] = text;
  }

  if (body.links !== undefined) {
    if (!Array.isArray(body.links)) return invalidField('links', 'an array of http or https URLs');
    const typed = body.links.filter((link) => !(typeof link === 'string' && link.trim() === ''));
    const links = typed.map(parseLink);
    if (links.some((link) => link === null)) return invalidField('links', 'an array of http or https URLs');
    const unique = [...new Set(links as string[])];
    if (unique.length > MAX_LINKS) return invalidField('links', `at most ${MAX_LINKS} links`);
    input.links = unique;
  }

  if (body.birth !== undefined) {
    if (body.birth !== null && (typeof body.birth !== 'string' || !isBirth(body.birth, today))) {
      return invalidField('birth', 'null, a year (YYYY) or a date (YYYY-MM-DD) that is not in the future');
    }
    input.birth = body.birth;
  }

  if (body.gender !== undefined) {
    if (body.gender !== null && !GENDERS.includes(body.gender as Gender)) return invalidField('gender', 'null, "female" or "male"');
    input.gender = body.gender as Gender | null;
  }

  if (body.avatar !== undefined) {
    const avatar = body.avatar;
    if (avatar !== null && !(isObject(avatar) && Number.isInteger(avatar.photoId) && (avatar.photoId as number) > 0 && isRelativeRect(avatar.rect))) {
      return invalidField('avatar', 'null or {"photoId": <id>, "rect": {left, top, right, bottom}}');
    }
    input.avatar = avatar === null ? null : { photoId: avatar.photoId as number, rect: { ...(avatar.rect as NonNullable<PersonInput['avatar']>['rect']) } };
  }

  const profileFields = Object.keys(input).filter((key) => key !== 'name');
  if (!known && input.name === undefined && profileFields.length > 0) {
    return apiError('person_name_required', 'An unknown person needs a name before other profile fields');
  }
  return input;
}
