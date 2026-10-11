import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { LibraryAccess } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { get } from '../db/query.js';
import { noRows } from '../db/sqlite.js';
import { albumPhotos, folders, photos } from '../db/schema.js';

/**
 * The part of the library the current request may see. `authenticate()` runs the rest of each API request
 * inside `runWithAccess`; code outside a request (scanning, thumbnails, startup) sees the whole library.
 */
const storage = new AsyncLocalStorage<LibraryAccess>();

const WHOLE_LIBRARY: LibraryAccess = { all: true };

export function runWithAccess<T>(access: LibraryAccess, fn: () => T): T {
  return storage.run(access, fn);
}

export function currentAccess(): LibraryAccess {
  return storage.getStore() ?? WHOLE_LIBRARY;
}

/** Whether a folder path is one of the granted folders or inside one. */
export function folderGranted(folderPath: string, access: LibraryAccess = currentAccess()): boolean {
  if (access.all) return true;
  return access.folders.some((granted) => folderPath === granted || folderPath.startsWith(granted.endsWith(path.sep) ? granted : granted + path.sep));
}

export function albumGranted(token: string, access: LibraryAccess = currentAccess()): boolean {
  return access.all || access.albums.includes(token);
}

/** SQL: the folder column is a granted folder or inside one. */
function folderCondition(column: typeof folders.path, granted: string): SQL {
  const prefix = granted.endsWith(path.sep) ? granted : granted + path.sep;
  return sql`(${column} = ${granted} OR instr(${column}, ${prefix}) = 1)`;
}

/**
 * The condition on `photos` for the photos the access shows: in a granted folder (with subfolders) or in a
 * granted album. Undefined for the whole library.
 */
export function visiblePhotoCondition(access: LibraryAccess = currentAccess()): SQL | undefined {
  if (access.all) return undefined;
  const options: SQL[] = [];
  if (access.folders.length > 0) {
    const grantedFolders = db.select({ id: folders.id }).from(folders)
      .where(or(...access.folders.map((granted) => folderCondition(folders.path, granted))));
    options.push(inArray(photos.folderId, grantedFolders));
  }
  if (access.albums.length > 0) {
    options.push(inArray(photos.id, db.select({ id: albumPhotos.photoId }).from(albumPhotos).where(inArray(albumPhotos.token, access.albums))));
  }
  return options.length > 0 ? or(...options) : noRows;
}

/** `condition` limited to visible photos (for queries on `photos`). */
export function andVisible(condition: SQL | undefined, access: LibraryAccess = currentAccess()): SQL | undefined {
  const visible = visiblePhotoCondition(access);
  return visible && condition ? and(condition, visible) : visible ?? condition;
}

/** A subquery of the ids of the visible photos, for tables keyed by photo id; undefined for the whole library. */
export function visiblePhotoIds(access: LibraryAccess = currentAccess()) {
  const visible = visiblePhotoCondition(access);
  return visible && db.select({ id: photos.id }).from(photos).where(visible);
}

export async function isPhotoVisible(photoId: number, access: LibraryAccess = currentAccess()): Promise<boolean> {
  if (access.all) return true;
  return (await get(db.select({ id: photos.id }).from(photos).where(and(eq(photos.id, photoId), visiblePhotoCondition(access))))) !== undefined;
}

/** Whether some visible photo has this file hash (thumbnails and previews are cached by hash). */
export async function isFileHashVisible(fileHash: string, access: LibraryAccess = currentAccess()): Promise<boolean> {
  if (access.all) return true;
  return (await get(db.select({ id: photos.id }).from(photos).where(and(eq(photos.fileHash, fileHash), visiblePhotoCondition(access))))) !== undefined;
}
