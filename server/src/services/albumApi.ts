import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { albumPhotos, folderAlbums, folders, photos } from '../db/schema.js';
import { SidecarService } from './SidecarService.js';
import { FolderScannerService } from './FolderScannerService.js';
import {
  addToAlbum, createAlbum, deleteAlbum, editAlbum, localIsoWithOffset, newAlbumToken, removeFromAlbum, type AlbumFields,
} from './albumSidecar.js';
import type { Album, PalomaAlbumDefinition, PalomaFolderFile } from '../../../shared/types.js';

type ErrorBody = { error: string; failedFolders?: string[] };
export type AlbumResult<T> = { status: 200; body: T } | { status: 400 | 404 | 409 | 500; body: ErrorBody };

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
  })
    .from(albumPhotos)
    .innerJoin(photos, eq(albumPhotos.photoId, photos.id))
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
    coverThumbnailUrl: cover ? `/api/cache/thumbnail/${cover.fileHash}` : null,
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

interface PhotoRef {
  id: number;
  filename: string;
  folderPath: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const bad = (error: string): AlbumResult<never> => ({ status: 400, body: { error } });
const notFound = (error: string): AlbumResult<never> => ({ status: 404, body: { error } });

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function parsePhotoIds(value: unknown): number[] | string {
  if (!Array.isArray(value) || value.length === 0) return 'photoIds must be a non-empty array of photo ids';
  if (!value.every((id) => Number.isInteger(id) && id > 0)) return 'photoIds must be a non-empty array of photo ids';
  return [...new Set(value as number[])];
}

function loadPhotos(ids: readonly number[]): PhotoRef[] | undefined {
  const rows = db.select({ id: photos.id, filename: photos.filename, folderPath: folders.path })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(inArray(photos.id, [...ids]))
    .all();
  return rows.length === ids.length ? rows : undefined;
}

function filesByFolder(refs: readonly PhotoRef[]): Map<string, string[]> {
  const byFolder = new Map<string, string[]>();
  for (const ref of refs) byFolder.set(ref.folderPath, [...(byFolder.get(ref.folderPath) ?? []), ref.filename]);
  return byFolder;
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

/**
 * Saves an album change folder by folder. Nothing is written if any sidecar is unreadable. Each folder that is
 * written is applied to the library at once; folders that fail are logged and reported.
 */
function runAlbumChange(
  dirs: readonly string[],
  mutate: (dir: string, data: PalomaFolderFile) => PalomaFolderFile,
): AlbumResult<never> | null {
  const sorted = [...new Set(dirs)].sort();
  const unreadable = sorted.filter((dir) => SidecarService.readFolderSidecar(dir).kind === 'unreadable');
  if (unreadable.length > 0) {
    const files = unreadable.map((dir) => SidecarService.getSidecarPath(dir));
    console.error(`Album change rejected; unreadable sidecars: ${files.join(', ')}`);
    return {
      status: 409,
      body: { error: `Unreadable ${files.join(', ')}. Fix or remove the file to change albums there.`, failedFolders: unreadable },
    };
  }

  const failed: string[] = [];
  for (const dir of sorted) {
    try {
      SidecarService.updateFolderSidecar(dir, (data) => mutate(dir, data));
    } catch (err) {
      console.error(`Failed to save an album change to the sidecar in ${dir}:`, err);
      failed.push(dir);
      continue;
    }
    FolderScannerService.applyFolderState(dir, SidecarService.getFolderState(dir));
  }
  if (failed.length > 0) {
    return { status: 500, body: { error: `Could not write .paloma.json in ${failed.join(', ')}`, failedFolders: failed } };
  }
  return null;
}

function currentAlbum(token: string): AlbumResult<Album> {
  const album = getAlbum(token);
  return album ? { status: 200, body: album } : { status: 500, body: { error: 'Album has no photos in the library' } };
}

/** `POST /api/albums`: a new album holding the given photos. */
export function createAlbumFromPhotos(body: unknown): AlbumResult<Album> {
  if (!isPlainObject(body)) return bad('Body must be a JSON object');
  const { name, photoIds, description, location } = body;
  if (!isName(name)) return bad('name must be a non-empty string');
  if (description !== undefined && typeof description !== 'string') return bad('description must be a string');
  if (location !== undefined && typeof location !== 'string') return bad('location must be a string');
  const ids = parsePhotoIds(photoIds);
  if (typeof ids === 'string') return bad(ids);
  const refs = loadPhotos(ids);
  if (!refs) return notFound('Photo not found');

  const token = newAlbumToken();
  const now = new Date();
  const fields = { name, date: localIsoWithOffset(now), description, location };
  const files = filesByFolder(refs);
  return runAlbumChange([...files.keys()], (dir, data) =>
    createAlbum(data, token, fields, files.get(dir)!, now.toISOString())) ?? currentAlbum(token);
}

function requireListed(token: string): AlbumResult<never> | null {
  return getAlbum(token) ? null : notFound('Album not found');
}

/** `POST /api/albums/:token/photos`. */
export function addAlbumPhotos(token: string, body: unknown): AlbumResult<Album> {
  const missing = requireListed(token);
  if (missing) return missing;
  const ids = parsePhotoIds(isPlainObject(body) ? body.photoIds : undefined);
  if (typeof ids === 'string') return bad(ids);
  const refs = loadPhotos(ids);
  if (!refs) return notFound('Photo not found');

  const source = resolveAlbum(loadCopies([token]).get(token) ?? []);
  const shown: PalomaAlbumDefinition = {};
  for (const [key, value] of Object.entries(shownFields(source))) if (value !== null) shown[key] = value;
  if (source?.modified) shown.modified = source.modified;

  const files = filesByFolder(refs);
  const modified = new Date().toISOString();
  return runAlbumChange([...files.keys()], (dir, data) => addToAlbum(data, token, shown, files.get(dir)!, modified))
    ?? currentAlbum(token);
}

/** `DELETE /api/albums/:token/photos`; when no photo is left, the album is gone. */
export function removeAlbumPhotos(token: string, body: unknown): AlbumResult<Album | { success: true; removed: true }> {
  const missing = requireListed(token);
  if (missing) return missing;
  const ids = parsePhotoIds(isPlainObject(body) ? body.photoIds : undefined);
  if (typeof ids === 'string') return bad(ids);
  const refs = loadPhotos(ids);
  if (!refs) return notFound('Photo not found');

  const memberIds = new Set((loadMembers([token]).get(token) ?? []).map((m) => m.id));
  const files = filesByFolder(refs.filter((ref) => memberIds.has(ref.id)));
  const modified = new Date().toISOString();
  const error = runAlbumChange([...files.keys()], (dir, data) => removeFromAlbum(data, token, files.get(dir)!, modified));
  if (error) return error;
  return { status: 200, body: getAlbum(token) ?? { success: true, removed: true } };
}

/** `PATCH /api/albums/:token`: any of name, description, location and coverPhotoId. */
export function editAlbumProperties(token: string, body: unknown): AlbumResult<Album> {
  const missing = requireListed(token);
  if (missing) return missing;
  if (!isPlainObject(body)) return bad('Body must be a JSON object');
  const { name, description, location, coverPhotoId } = body;
  if (name === undefined && description === undefined && location === undefined && coverPhotoId === undefined) {
    return bad('Expected at least one of name, description, location, coverPhotoId');
  }
  if (name !== undefined && !isName(name)) return bad('name must be a non-empty string');
  if (description !== undefined && typeof description !== 'string') return bad('description must be a string');
  if (location !== undefined && typeof location !== 'string') return bad('location must be a string');

  let cover: Member | null | undefined;
  if (coverPhotoId === null) cover = null;
  else if (coverPhotoId !== undefined) {
    cover = (loadMembers([token]).get(token) ?? []).find((m) => m.id === coverPhotoId);
    if (!cover) return bad('coverPhotoId must be a photo in the album');
  }

  const shown = shownFields(resolveAlbum(loadCopies([token]).get(token) ?? []));
  if (name !== undefined) shown.name = name;
  if (description !== undefined) shown.description = description || null;
  if (location !== undefined) shown.location = location || null;

  const modified = new Date().toISOString();
  return runAlbumChange(albumFolders(token), (dir, data) => {
    const coverHere = cover === undefined ? undefined : cover !== null && cover.folderPath === dir ? cover.filename : null;
    return editAlbum(data, token, shown, coverHere, modified);
  }) ?? currentAlbum(token);
}

/** `DELETE /api/albums/:token`: removes the album everywhere; photo files are not touched. */
export function deleteAlbumEverywhere(token: string): AlbumResult<{ success: true }> {
  const missing = requireListed(token);
  if (missing) return missing;
  const modified = new Date().toISOString();
  return runAlbumChange(albumFolders(token), (_dir, data) => deleteAlbum(data, token, modified))
    ?? { status: 200, body: { success: true } };
}
