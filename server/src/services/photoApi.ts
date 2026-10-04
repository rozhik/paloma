import path from 'node:path';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../db/index.js';
import { albumPhotos, edits, folders, photos } from '../db/schema.js';
import { SidecarService, SidecarUnreadableError, type FieldPatch } from './SidecarService.js';
import { FolderScannerService } from './FolderScannerService.js';
import { apiError } from './apiError.js';
import type { ApiError, Photo } from '../../../shared/types.js';

type PhotoRow = typeof photos.$inferSelect;
type FolderRow = typeof folders.$inferSelect;
type EditRow = typeof edits.$inferSelect;

export type ApiResult<T> = { status: 200; body: T } | { status: 400 | 404 | 409 | 500; body: ApiError };

export function toApiPhoto(photo: PhotoRow, folder: FolderRow, edit: EditRow | null, albums: string[] = []): Photo {
  return {
    ...photo,
    keywords: photo.keywords ? JSON.parse(photo.keywords) : [],
    albums,
    folderPath: folder.path,
    filePath: path.join(folder.path, photo.filename),
    edits: edit ? JSON.parse(edit.editInstructionsJson) : null,
    thumbnailUrl: `/api/cache/thumbnail/${photo.fileHash}`,
    previewUrl: `/api/cache/preview/${photo.fileHash}`,
  };
}

export interface PhotoListQuery {
  folderId?: unknown;
  starred?: unknown;
  album?: unknown;
  query?: unknown;
  includeHidden?: unknown;
  limit?: unknown;
  offset?: unknown;
}

/** Album tokens of each photo, keyed by photo id. */
function albumsOf(photoIds: number[]): Map<number, string[]> {
  const byPhoto = new Map<number, string[]>();
  if (photoIds.length === 0) return byPhoto;
  const rows = db.select().from(albumPhotos).where(inArray(albumPhotos.photoId, photoIds)).all();
  for (const { photoId, token } of rows) byPhoto.set(photoId, [...(byPhoto.get(photoId) ?? []), token]);
  return byPhoto;
}

export function listPhotos({ folderId, starred, album, query, includeHidden, limit = '500', offset = '0' }: PhotoListQuery): Photo[] {
  const conditions = [];
  if (folderId) conditions.push(eq(photos.folderId, Number(folderId)));
  if (starred === 'true') conditions.push(eq(photos.isStarred, true));
  if (album && typeof album === 'string') {
    conditions.push(inArray(photos.id, db.select({ id: albumPhotos.photoId }).from(albumPhotos).where(eq(albumPhotos.token, album))));
  }
  if (includeHidden !== 'true') conditions.push(eq(photos.isHidden, false));
  if (query && typeof query === 'string') conditions.push(like(photos.filename, `%${query}%`));

  const rows = db.select({ photo: photos, folder: folders, edit: edits })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(photos.dateTaken), photos.id)
    .limit(Number(limit))
    .offset(Number(offset))
    .all();
  const albums = albumsOf(rows.map(({ photo }) => photo.id));
  return rows.map(({ photo, folder, edit }) => toApiPhoto(photo, folder, edit, albums.get(photo.id)));
}

/** Folders with the number of photos that are not hidden. */
export function listFolders(): Array<FolderRow & { photoCount: number }> {
  return db.select().from(folders).all().map((folder) => ({
    ...folder,
    photoCount: db.select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.folderId, folder.id), eq(photos.isHidden, false)))
      .all().length,
  }));
}

const invalidField = (field: string, expected: string): ApiError =>
  apiError('invalid_field', `${field} must be ${expected}`, { field });

/** Validates a PATCH body into a field patch; returns an error body for an invalid one. */
export function parsePhotoPatch(body: unknown): FieldPatch | ApiError {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return apiError('invalid_body', 'Body must be a JSON object');
  }
  const { isStarred, isHidden, caption, keywords } = body as Record<string, unknown>;

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
    patch.keywords = [...new Set(keywords.filter((k) => k !== ''))];
  }
  if (Object.keys(patch).length === 0) {
    return apiError('no_photo_fields', 'Expected at least one of isStarred, isHidden, caption, keywords');
  }
  return patch;
}

function getApiPhoto(photoId: number): Photo | undefined {
  const row = db.select({ photo: photos, folder: folders, edit: edits })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(eq(photos.id, photoId))
    .get();
  return row && toApiPhoto(row.photo, row.folder, row.edit, albumsOf([photoId]).get(photoId));
}

/** Saves a change to a photo's fields in its folder's sidecar first, then updates the library from disk. */
export function updatePhoto(photoId: number, body: unknown): ApiResult<Photo> {
  const patch = parsePhotoPatch(body);
  if ('code' in patch) return { status: 400, body: patch };

  const photo = getApiPhoto(photoId);
  if (!photo?.folderPath) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };
  const dir = photo.folderPath;

  try {
    SidecarService.updatePhotoFields(dir, photo.filename, patch);
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
  FolderScannerService.applyFolderState(dir, SidecarService.getFolderState(dir));
  return { status: 200, body: getApiPhoto(photoId)! };
}
