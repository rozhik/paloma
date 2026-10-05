import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { albumPhotos, edits, folderAlbums, folders, photos } from '../db/schema.js';
import {
  addToAlbum, createAlbum, deleteAlbum, editAlbum, localIsoWithOffset, newAlbumToken, removeFromAlbum, type AlbumFields,
} from './albumSidecar.js';
import { apiError } from './apiError.js';
import { libraryImageUrls } from './libraryImages.js';
import { filesByFolder, loadPhotos, parsePhotoIds, saveFolderByFolder } from './folderChanges.js';
import type { Album, ApiError, ApiErrorCode, PalomaAlbumDefinition } from '../../../shared/types.js';

export type AlbumResult<T> = { status: 200; body: T } | { status: 400 | 404 | 409 | 500; body: ApiError };

/** One folder's copy of an album definition, as indexed in the library. */
export interface AlbumCopy {
  folderPath: string;
  name: string | null;
  date: string | null;
  location: string | null;
  description: string | null;
  cover: string | null;
  modified: string | null;
}

interface Member {
  id: number;
  filename: string;
  folderPath: string;
  isHidden: boolean;
  dateTaken: string | null;
  fileHash: string;
  /** The photo's edit chain from the `edits` table, if any */
  editsJson: string | null;
}

const byPath = (a: AlbumCopy, b: AlbumCopy): number => (a.folderPath < b.folderPath ? -1 : a.folderPath > b.folderPath ? 1 : 0);

/** Newest Paloma change first, then folder path order. */
function byRecency(a: AlbumCopy, b: AlbumCopy): number {
  if (a.modified !== b.modified) {
    if (a.modified === null) return 1;
    if (b.modified === null) return -1;
    return a.modified > b.modified ? -1 : 1;
  }
  return byPath(a, b);
}

/**
 * The copy whose name, date, description and location the library shows: the newest `modified`, else the first
 * copy by folder path with a name, else the first copy by path. Undefined when there are no copies.
 */
export function resolveAlbum(copies: readonly AlbumCopy[]): AlbumCopy | undefined {
  const changed = copies.filter((copy) => copy.modified !== null).sort(byRecency);
  if (changed.length > 0) return changed[0];
  const sorted = [...copies].sort(byPath);
  return sorted.find((copy) => copy.name !== null && copy.name !== '') ?? sorted[0];
}

function shownFields(copy: AlbumCopy | undefined): AlbumFields {
  return {
    name: copy?.name || null,
    date: copy?.date ?? null,
    description: copy?.description ?? null,
    location: copy?.location ?? null,
  };
}

/** Members in photo-list order: newest capture date first, undated last. */
function inListOrder(members: Member[]): Member[] {
  return [...members].sort((a, b) => {
    if (a.dateTaken === b.dateTaken) return a.id - b.id;
    if (a.dateTaken === null) return 1;
    if (b.dateTaken === null) return -1;
    return a.dateTaken > b.dateTaken ? -1 : 1;
  });
}

/** The chosen cover while it is a non-hidden member, else the first non-hidden member, else any member. */
function pickCover(copies: readonly AlbumCopy[], members: Member[]): Member | undefined {
  for (const copy of copies.filter((c) => c.cover !== null).sort(byRecency)) {
    const chosen = members.find((m) => m.folderPath === copy.folderPath && m.filename === copy.cover && !m.isHidden);
    if (chosen) return chosen;
  }
  const ordered = inListOrder(members);
  return ordered.find((m) => !m.isHidden) ?? ordered[0];
}

function loadMembers(tokens?: readonly string[]): Map<string, Member[]> {
  const rows = db.select({
    token: albumPhotos.token,
    id: photos.id,
    filename: photos.filename,
    folderPath: folders.path,
    isHidden: photos.isHidden,
    dateTaken: photos.dateTaken,
    fileHash: photos.fileHash,
    editsJson: edits.editInstructionsJson,
  })
    .from(albumPhotos)
    .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(tokens ? inArray(albumPhotos.token, [...tokens]) : undefined)
    .all();
  const members = new Map<string, Member[]>();
  for (const { token, ...member } of rows) {
    const list = members.get(token) ?? [];
    list.push(member);
    members.set(token, list);
  }
  return members;
}

function loadCopies(tokens: readonly string[]): Map<string, AlbumCopy[]> {
  const copies = new Map<string, AlbumCopy[]>();
  if (tokens.length === 0) return copies;
  const rows = db.select({
    token: folderAlbums.token,
    folderPath: folders.path,
    name: folderAlbums.name,
    date: folderAlbums.date,
    location: folderAlbums.location,
    description: folderAlbums.description,
    cover: folderAlbums.cover,
    modified: folderAlbums.modified,
  })
    .from(folderAlbums)
    .innerJoin(folders, eq(folderAlbums.folderId, folders.id))
    .where(inArray(folderAlbums.token, [...tokens]))
    .all();
  for (const { token, ...copy } of rows) {
    const list = copies.get(token) ?? [];
    list.push(copy);
    copies.set(token, list);
  }
  return copies;
}

function toAlbum(token: string, copies: AlbumCopy[], members: Member[]): Album {
  const fields = shownFields(resolveAlbum(copies));
  const cover = pickCover(copies, members);
  return {
    token,
    ...fields,
    photoCount: members.filter((m) => !m.isHidden).length,
    coverPhotoId: cover?.id ?? null,
    coverThumbnailUrl: cover ? libraryImageUrls(cover, cover.editsJson).thumbnailUrl : null,
  };
}

/** Albums with at least one photo in the library, sorted by name with untitled albums last. */
export function listAlbums(tokens?: readonly string[]): Album[] {
  const members = loadMembers(tokens);
  const copies = loadCopies([...members.keys()]);
  return [...members.entries()]
    .map(([token, list]) => toAlbum(token, copies.get(token) ?? [], list))
    .sort((a, b) => {
      if (a.name === null || b.name === null) return a.name === b.name ? a.token.localeCompare(b.token) : a.name === null ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.token.localeCompare(b.token);
    });
}

export function getAlbum(token: string): Album | undefined {
  return listAlbums([token])[0];
}

// --- Changes ---

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const bad = (code: ApiErrorCode, error: string, params?: ApiError['params']): AlbumResult<never> =>
  ({ status: 400, body: apiError(code, error, params) });
const notFound = (code: ApiErrorCode, error: string): AlbumResult<never> => ({ status: 404, body: apiError(code, error) });
const notString = (field: string): AlbumResult<never> => bad('invalid_field', `${field} must be a string`, { field });
const noName = (): AlbumResult<never> => bad('album_name_required', 'name must be a non-empty string');
const noPhotoIds = (): AlbumResult<never> => bad('photo_ids_required', 'photoIds must be a non-empty array of photo ids');

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Library folders that define the album or have a photo in it. */
function albumFolders(token: string): string[] {
  const defining = db.select({ path: folders.path })
    .from(folderAlbums)
    .innerJoin(folders, eq(folderAlbums.folderId, folders.id))
    .where(eq(folderAlbums.token, token))
    .all()
    .map((row) => row.path);
  const withMembers = (loadMembers([token]).get(token) ?? []).map((m) => m.folderPath);
  return [...new Set([...defining, ...withMembers])];
}

function currentAlbum(token: string): AlbumResult<Album> {
  const album = getAlbum(token);
  return album ? { status: 200, body: album } : { status: 500, body: apiError('album_empty', 'Album has no photos in the library') };
}

/** `POST /api/albums`: a new album holding the given photos. */
export function createAlbumFromPhotos(body: unknown): AlbumResult<Album> {
  if (!isPlainObject(body)) return bad('invalid_body', 'Body must be a JSON object');
  const { name, photoIds, description, location } = body;
  if (!isName(name)) return noName();
  if (description !== undefined && typeof description !== 'string') return notString('description');
  if (location !== undefined && typeof location !== 'string') return notString('location');
  const ids = parsePhotoIds(photoIds);
  if (!ids) return noPhotoIds();
  const refs = loadPhotos(ids);
  if (!refs) return notFound('photo_not_found', 'Photo not found');

  const token = newAlbumToken();
  const now = new Date();
  const fields = { name, date: localIsoWithOffset(now), description, location };
  const files = filesByFolder(refs);
  return saveFolderByFolder('album', [...files.keys()], (dir, data) =>
    createAlbum(data, token, fields, files.get(dir)!, now.toISOString())) ?? currentAlbum(token);
}

function requireListed(token: string): AlbumResult<never> | null {
  return getAlbum(token) ? null : notFound('album_not_found', 'Album not found');
}

/** `POST /api/albums/:token/photos`. */
export function addAlbumPhotos(token: string, body: unknown): AlbumResult<Album> {
  const missing = requireListed(token);
  if (missing) return missing;
  const ids = parsePhotoIds(isPlainObject(body) ? body.photoIds : undefined);
  if (!ids) return noPhotoIds();
  const refs = loadPhotos(ids);
  if (!refs) return notFound('photo_not_found', 'Photo not found');

  const source = resolveAlbum(loadCopies([token]).get(token) ?? []);
  const shown: PalomaAlbumDefinition = {};
  for (const [key, value] of Object.entries(shownFields(source))) if (value !== null) shown[key] = value;
  if (source?.modified) shown.modified = source.modified;

  const files = filesByFolder(refs);
  const modified = new Date().toISOString();
  return saveFolderByFolder('album', [...files.keys()], (dir, data) => addToAlbum(data, token, shown, files.get(dir)!, modified))
    ?? currentAlbum(token);
}

/** `DELETE /api/albums/:token/photos`; when no photo is left, the album is gone. */
export function removeAlbumPhotos(token: string, body: unknown): AlbumResult<Album | { success: true; removed: true }> {
  const missing = requireListed(token);
  if (missing) return missing;
  const ids = parsePhotoIds(isPlainObject(body) ? body.photoIds : undefined);
  if (!ids) return noPhotoIds();
  const refs = loadPhotos(ids);
  if (!refs) return notFound('photo_not_found', 'Photo not found');

  const memberIds = new Set((loadMembers([token]).get(token) ?? []).map((m) => m.id));
  const files = filesByFolder(refs.filter((ref) => memberIds.has(ref.id)));
  const modified = new Date().toISOString();
  const error = saveFolderByFolder('album', [...files.keys()], (dir, data) => removeFromAlbum(data, token, files.get(dir)!, modified));
  if (error) return error;
  return { status: 200, body: getAlbum(token) ?? { success: true, removed: true } };
}

/** `PATCH /api/albums/:token`: any of name, description, location and coverPhotoId. */
export function editAlbumProperties(token: string, body: unknown): AlbumResult<Album> {
  const missing = requireListed(token);
  if (missing) return missing;
  if (!isPlainObject(body)) return bad('invalid_body', 'Body must be a JSON object');
  const { name, description, location, coverPhotoId } = body;
  if (name === undefined && description === undefined && location === undefined && coverPhotoId === undefined) {
    return bad('no_album_fields', 'Expected at least one of name, description, location, coverPhotoId');
  }
  if (name !== undefined && !isName(name)) return noName();
  if (description !== undefined && typeof description !== 'string') return notString('description');
  if (location !== undefined && typeof location !== 'string') return notString('location');

  let cover: Member | null | undefined;
  if (coverPhotoId === null) cover = null;
  else if (coverPhotoId !== undefined) {
    cover = (loadMembers([token]).get(token) ?? []).find((m) => m.id === coverPhotoId);
    if (!cover) return bad('cover_not_in_album', 'coverPhotoId must be a photo in the album');
  }

  const shown = shownFields(resolveAlbum(loadCopies([token]).get(token) ?? []));
  if (name !== undefined) shown.name = name;
  if (description !== undefined) shown.description = description || null;
  if (location !== undefined) shown.location = location || null;

  const modified = new Date().toISOString();
  return saveFolderByFolder('album', albumFolders(token), (dir, data) => {
    const coverHere = cover === undefined ? undefined : cover !== null && cover.folderPath === dir ? cover.filename : null;
    return editAlbum(data, token, shown, coverHere, modified);
  }) ?? currentAlbum(token);
}

/** `DELETE /api/albums/:token`: removes the album everywhere; photo files are not touched. */
export function deleteAlbumEverywhere(token: string): AlbumResult<{ success: true }> {
  const missing = requireListed(token);
  if (missing) return missing;
  const modified = new Date().toISOString();
  return saveFolderByFolder('album', albumFolders(token), (_dir, data) => deleteAlbum(data, token, modified))
    ?? { status: 200, body: { success: true } };
}
