import path from 'node:path';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked, get } from '../db/query.js';
import { albumPhotos, edits, folders, geoPlaces, photos } from '../db/schema.js';
import { SidecarService, SidecarUnreadableError, type FieldPatch } from './SidecarService.js';
import { apiError } from './apiError.js';
import { photoFilters, type PhotoFilterQuery } from './photoFilters.js';
import { placeResolver } from './geocoding.js';
import { normalizeLang } from './placeCache.js';
import { loadPhotos, parsePhotoIds, reapplyFolder, saveFolderByFolder } from './folderChanges.js';
import { withFolderLock } from './folderLock.js';
import { isGeotag } from './location.js';
import { libraryImageUrls, libraryLookup } from './libraryImages.js';
import { describeProblem, validateChain, type ChainProblem } from './editChain.js';
import { parseEditsJson } from './photoImages.js';
import { uniqueKeywords } from './embeddedText.js';
import { parseKeywords, textKey } from './libraryText.js';
import type { ApiError, Geotag, Photo } from '../../../shared/types.js';
import { andVisible, currentAccess, folderGranted, visiblePhotoCondition } from '../auth/scope.js';

type PhotoRow = typeof photos.$inferSelect;
type FolderRow = typeof folders.$inferSelect;
type EditRow = typeof edits.$inferSelect;

export type ApiResult<T> = { status: 200; body: T } | { status: 400 | 403 | 404 | 409 | 500; body: ApiError };

export function toApiPhoto(
  photo: PhotoRow, folder: FolderRow, edit: EditRow | null, albums: string[] = [], place: string | null = null,
): Photo {
  const {
    exifLatitude, exifLongitude, geoCell, metadataVersion, embeddedCaption, embeddedKeywords, cameraMake, cameraModel, searchText,
    ...columns
  } = photo;
  return {
    ...columns,
    place,
    keywords: photo.keywords ? JSON.parse(photo.keywords) : [],
    albums,
    folderPath: folder.path,
    filePath: path.join(folder.path, photo.filename),
    edits: parseEditsJson(edit?.editInstructionsJson),
    ...libraryImageUrls(photo, edit?.editInstructionsJson),
  };
}

export interface PhotoListQuery extends PhotoFilterQuery {
  limit?: unknown;
  offset?: unknown;
  /** Language of the place names; without it, `place` is null */
  lang?: unknown;
}

/** Album tokens of each photo, keyed by photo id. */
async function albumsOf(photoIds: number[]): Promise<Map<number, string[]>> {
  const byPhoto = new Map<number, string[]>();
  const rows = await chunked(photoIds, BATCH_SIZE, (ids) => all(db.select().from(albumPhotos).where(inArray(albumPhotos.photoId, ids))));
  for (const { photoId, token } of rows) byPhoto.set(photoId, [...(byPhoto.get(photoId) ?? []), token]);
  return byPhoto;
}

export async function listPhotos({ limit = '500', offset = '0', lang, ...filters }: PhotoListQuery): Promise<Photo[]> {
  // A language nobody uses joins no names
  const language = lang === undefined ? '' : normalizeLang(lang);
  if (language) placeResolver.noteLanguage(language);
  const rows = await all(db.select({ photo: photos, folder: folders, edit: edits, place: geoPlaces.name })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .leftJoin(geoPlaces, and(eq(geoPlaces.cell, photos.geoCell), eq(geoPlaces.lang, language)))
    .where(await photoFilters(filters))
    .orderBy(desc(photos.dateTaken), photos.id)
    .limit(Number(limit))
    .offset(Number(offset)));
  const albums = await albumsOf(rows.map(({ photo }) => photo.id));
  return rows.map(({ photo, folder, edit, place }) => toApiPhoto(photo, folder, edit, albums.get(photo.id), place));
}

/**
 * Folders with the number of photos that are not hidden. With limited access: only the granted folders and
 * their subfolders, counting the photos the user sees.
 */
export async function listFolders(): Promise<Array<FolderRow & { photoCount: number }>> {
  const access = currentAccess();
  const rows = await all(db.select({ folder: folders, photoCount: count(photos.id) })
    .from(folders)
    .leftJoin(photos, and(eq(photos.folderId, folders.id), eq(photos.isHidden, false), visiblePhotoCondition(access)))
    .groupBy(folders.id)
    .orderBy(folders.id));
  return rows.filter(({ folder }) => folderGranted(folder.path, access)).map(({ folder, photoCount }) => ({ ...folder, photoCount }));
}

const invalidField = (field: string, expected: string): ApiError =>
  apiError('invalid_field', `${field} must be ${expected}`, { field });

/** A `location` from a request body: a geotag, or null to clear; an error body for anything else. */
export function parseLocation(location: unknown): Geotag | null | ApiError {
  if (location === null) return null;
  if (!isGeotag(location)) {
    return apiError('invalid_location', 'location must be null or {"lat": -90..90, "lon": -180..180}');
  }
  return { lat: location.lat, lon: location.lon };
}

/**
 * The sidecar change for a location: clearing writes `"geotag": null` only when the camera has a location
 * that would otherwise show through, and removes the key otherwise.
 */
function geotagPatch(location: Geotag | null, exif: { exifLatitude: number | null }): Geotag | null | false {
  if (location !== null) return location;
  return exif.exifLatitude !== null ? null : false;
}

/** Whether the photo file has embedded text, so clearing the field stores `""` or `[]` instead of removing it. */
function embeddedState(file: { embeddedCaption: string | null; embeddedKeywords: string | null }): Pick<FieldPatch, 'captionEmbedded' | 'keywordsEmbedded'> {
  return { captionEmbedded: file.embeddedCaption !== null, keywordsEmbedded: parseKeywords(file.embeddedKeywords).length > 0 };
}

/** Validates a PATCH body into a field patch; returns an error body for an invalid one. */
export function parsePhotoPatch(body: unknown): FieldPatch | ApiError {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return apiError('invalid_body', 'Body must be a JSON object');
  }
  const { isStarred, isHidden, caption, keywords, location } = body as Record<string, unknown>;

  const patch: FieldPatch = {};
  if (isStarred !== undefined) {
    if (typeof isStarred !== 'boolean') return invalidField('isStarred', 'a boolean');
    patch.star = isStarred;
  }
  if (isHidden !== undefined) {
    if (typeof isHidden !== 'boolean') return invalidField('isHidden', 'a boolean');
    patch.hidden = isHidden;
  }
  if (caption !== undefined) {
    if (typeof caption !== 'string') return invalidField('caption', 'a string');
    patch.caption = caption;
  }
  if (keywords !== undefined) {
    if (!Array.isArray(keywords) || !keywords.every((k) => typeof k === 'string')) {
      return invalidField('keywords', 'an array of strings');
    }
    patch.keywords = uniqueKeywords(keywords);
  }
  if (location !== undefined) {
    const parsed = parseLocation(location);
    if (parsed !== null && 'code' in parsed) return parsed;
    // null for now; updatePhoto decides between storing null and deleting the key
    patch.geotag = parsed;
  }
  if (Object.keys(patch).length === 0) {
    return apiError('no_photo_fields', 'Expected at least one of isStarred, isHidden, caption, keywords, location');
  }
  return patch;
}

export async function getApiPhoto(photoId: number): Promise<Photo | undefined> {
  const row = await get(db.select({ photo: photos, folder: folders, edit: edits })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    // A photo the current request may not see does not exist for it
    .where(andVisible(eq(photos.id, photoId))));
  return row && toApiPhoto(row.photo, row.folder, row.edit, (await albumsOf([photoId])).get(photoId));
}

/** The listed photos as the API shows them, in the order of the ids; ids not in the library are left out. */
async function getApiPhotos(photoIds: readonly number[]): Promise<Photo[]> {
  const shown: Photo[] = [];
  for (const id of photoIds) {
    const photo = await getApiPhoto(id);
    if (photo) shown.push(photo);
  }
  return shown;
}

/**
 * Writes a field change to the photo's folder sidecar, then updates the library from disk.
 * Returns the error result when the sidecar is unreadable or cannot be written, leaving the library unchanged.
 */
export function savePhotoPatch(photo: Photo, patch: FieldPatch): Promise<ApiResult<never> | null> {
  const dir = photo.folderPath!;
  return withFolderLock(dir, () => savePatchLocked(dir, photo, patch));
}

async function savePatchLocked(dir: string, photo: Photo, patch: FieldPatch): Promise<ApiResult<never> | null> {
  try {
    await SidecarService.updatePhotoFields(dir, photo.filename, patch);
  } catch (err) {
    console.error(`Failed to save ${photo.filename} to the sidecar in ${dir}:`, err);
    return err instanceof SidecarUnreadableError
      ? {
        status: 409,
        body: apiError('sidecar_unreadable', `${err.message}. Fix or remove the file to change photos in this folder.`,
          { files: err.filePath }),
      }
      : { status: 500, body: apiError('sidecar_write_failed', `Could not write .paloma.json in ${dir}`, { folders: dir }) };
  }
  // The whole folder, since saving may also have re-imported a changed Picasa .ini
  await reapplyFolder(dir);
  return null;
}

/**
 * `PUT /api/photos/:id/edits`: replaces the photo's edit chain (`[]` removes it). Steps of available filters
 * are validated and get their defaults; steps of other filters are saved as sent.
 */
export async function saveEdits(photoId: number, body: unknown): Promise<ApiResult<Photo>> {
  const value = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const check = validateChain(value.edits, libraryLookup);
  if (!check.ok) return { status: 400, body: editsInvalid(check.problem) };

  const photo = await getApiPhoto(photoId);
  if (!photo?.folderPath) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };
  const failed = await savePhotoPatch(photo, { edits: check.steps });
  return failed ?? { status: 200, body: (await getApiPhoto(photoId))! };
}

/** The 400 body for an invalid edit chain, naming the step, filter and parameter. */
export function editsInvalid(problem: ChainProblem): ApiError {
  const params: Record<string, string | number> = { step: problem.index + 1 };
  if (problem.filter) params.filter = problem.filter;
  if (problem.param) params.param = problem.param;
  return apiError('edits_invalid', `Invalid edits: ${describeProblem(problem)}`, params);
}

/** Saves a change to a photo's fields in its folder's sidecar first, then updates the library from disk. */
export async function updatePhoto(photoId: number, body: unknown): Promise<ApiResult<Photo>> {
  const patch = parsePhotoPatch(body);
  if ('code' in patch) return { status: 400, body: patch };

  const photo = await getApiPhoto(photoId);
  if (!photo?.folderPath) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };
  const file = (await get(db.select({ exifLatitude: photos.exifLatitude, embeddedCaption: photos.embeddedCaption, embeddedKeywords: photos.embeddedKeywords })
    .from(photos).where(eq(photos.id, photoId))))!;
  if (patch.geotag !== undefined && patch.geotag !== false) patch.geotag = geotagPatch(patch.geotag, file);
  Object.assign(patch, embeddedState(file));

  const failed = await savePhotoPatch(photo, patch);
  if (failed) return failed;
  if (patch.geotag !== undefined) placeResolver.wake();
  return { status: 200, body: (await getApiPhoto(photoId))! };
}

/**
 * `POST /api/photos/location`: sets (or clears, with `null`) the location of several photos, possibly in
 * several folders, saving folder by folder. Responds with the updated photos.
 */
export async function setPhotosLocation(body: unknown): Promise<ApiResult<Photo[]>> {
  const { photoIds, location } = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const ids = parsePhotoIds(photoIds);
  if (!ids) return { status: 400, body: apiError('photo_ids_required', 'photoIds must be a non-empty array of photo ids') };
  if (location === undefined) return { status: 400, body: apiError('invalid_location', 'location is required') };
  const parsed = parseLocation(location);
  if (parsed !== null && 'code' in parsed) return { status: 400, body: parsed };
  const refs = await loadPhotos(ids);
  if (!refs) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };

  const exif = new Map((await chunked(ids, BATCH_SIZE, (chunk) => all(db.select({ id: photos.id, exifLatitude: photos.exifLatitude })
    .from(photos).where(inArray(photos.id, chunk)))))
    .map((row) => [row.id, row]));
  const patches = new Map<string, Record<string, FieldPatch>>();
  for (const ref of refs) {
    const folderPatches = patches.get(ref.folderPath) ?? {};
    folderPatches[ref.filename] = { geotag: geotagPatch(parsed, exif.get(ref.id)!) };
    patches.set(ref.folderPath, folderPatches);
  }

  const modified = new Date().toISOString();
  const error = await saveFolderByFolder('photo location', [...patches.keys()], (dir, data) =>
    SidecarService.patchPhotos(data, patches.get(dir)!, modified));
  placeResolver.wake();
  if (error) return error;
  return { status: 200, body: await getApiPhotos(ids) };
}

/** Distinct non-empty strings of an optional array; null for anything that is not an array of strings. */
function tagList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return uniqueKeywords(value);
}

/**
 * `POST /api/photos/keywords`: adds the `add` tags a photo does not have yet (ignoring case) to the end of its
 * tags and removes the `remove` tags, for several photos, possibly in several folders, saving folder by folder.
 * Starts from each photo's current tags, embedded ones included. Responds with the updated photos.
 */
export async function changePhotosKeywords(body: unknown): Promise<ApiResult<Photo[]>> {
  const value = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const ids = parsePhotoIds(value.photoIds);
  if (!ids) return { status: 400, body: apiError('photo_ids_required', 'photoIds must be a non-empty array of photo ids') };
  const add = tagList(value.add);
  const remove = tagList(value.remove);
  if (add === null) return { status: 400, body: invalidField('add', 'an array of strings') };
  if (remove === null) return { status: 400, body: invalidField('remove', 'an array of strings') };
  if (add.length === 0 && remove.length === 0) {
    return { status: 400, body: apiError('no_photo_fields', 'Expected a non-empty add or remove list') };
  }
  const refs = await loadPhotos(ids);
  if (!refs) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };

  const rows = new Map((await chunked(ids, BATCH_SIZE, (chunk) => all(db.select({
    id: photos.id, keywords: photos.keywords, embeddedCaption: photos.embeddedCaption, embeddedKeywords: photos.embeddedKeywords,
  }).from(photos).where(inArray(photos.id, chunk))))).map((row) => [row.id, row]));
  const removed = new Set(remove.map(textKey));
  const patches = new Map<string, Record<string, FieldPatch>>();
  for (const ref of refs) {
    const row = rows.get(ref.id)!;
    const current = parseKeywords(row.keywords);
    const keywords = uniqueKeywords([...current, ...add]).filter((keyword) => !removed.has(textKey(keyword)));
    if (JSON.stringify(keywords) === JSON.stringify(current)) continue;
    const folderPatches = patches.get(ref.folderPath) ?? {};
    folderPatches[ref.filename] = { keywords, ...embeddedState(row) };
    patches.set(ref.folderPath, folderPatches);
  }

  const modified = new Date().toISOString();
  const error = await saveFolderByFolder('photo tags', [...patches.keys()], (dir, data) =>
    SidecarService.patchPhotos(data, patches.get(dir)!, modified));
  if (error) return error;
  return { status: 200, body: await getApiPhotos(ids) };
}
