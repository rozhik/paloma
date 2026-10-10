import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked } from '../db/query.js';
import { folders, photos } from '../db/schema.js';
import { SidecarService } from './SidecarService.js';
import { FolderScannerService } from './FolderScannerService.js';
import { withFolderLock } from './folderLock.js';
import { apiError } from './apiError.js';
import type { ApiError, PalomaFolderFile } from '../../../shared/types.js';

// Changes that span the sidecars of several folders: albums and batch photo changes

export interface PhotoRef {
  id: number;
  filename: string;
  folderPath: string;
}

/** Distinct positive integer ids of a non-empty array; null for anything else. */
export function parsePhotoIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((id) => Number.isInteger(id) && id > 0)) return null;
  return [...new Set(value as number[])];
}

/** The listed photos, or undefined if any of them is not in the library. */
export async function loadPhotos(ids: readonly number[]): Promise<PhotoRef[] | undefined> {
  const rows = await chunked(ids, BATCH_SIZE, (chunk) => all(db.select({ id: photos.id, filename: photos.filename, folderPath: folders.path })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(inArray(photos.id, chunk))));
  return rows.length === ids.length ? rows : undefined;
}

/** Updates the library from a folder's files; callers hold the folder's lock across the write before it. */
export async function reapplyFolder(dir: string): Promise<void> {
  await FolderScannerService.applyFolderState(dir, await SidecarService.getFolderState(dir));
}

/** File names of the photos keyed by folder path. */
export function filesByFolder(refs: readonly PhotoRef[]): Map<string, string[]> {
  const byFolder = new Map<string, string[]>();
  for (const ref of refs) byFolder.set(ref.folderPath, [...(byFolder.get(ref.folderPath) ?? []), ref.filename]);
  return byFolder;
}

/**
 * Saves a change to several folders' sidecars folder by folder. Nothing is written if any sidecar is unreadable.
 * Each folder that is written is applied to the library at once; folders that fail are logged and reported.
 * `subject` names the change in the log, e.g. `album`.
 */
export async function saveFolderByFolder(
  subject: string,
  dirs: readonly string[],
  mutate: (dir: string, data: PalomaFolderFile) => PalomaFolderFile,
): Promise<{ status: 409 | 500; body: ApiError } | null> {
  const sorted = [...new Set(dirs)].sort();
  const reads = await Promise.all(sorted.map((dir) => SidecarService.readFolderSidecar(dir)));
  const unreadable = sorted.filter((_, i) => reads[i].kind === 'unreadable');
  if (unreadable.length > 0) {
    const files = unreadable.map((dir) => SidecarService.getSidecarPath(dir));
    console.error(`The ${subject} change was rejected; unreadable sidecars: ${files.join(', ')}`);
    return {
      status: 409,
      body: {
        ...apiError('sidecar_unreadable', `Unreadable ${files.join(', ')}. Fix or remove the file to make changes there.`,
          { files: files.join(', ') }),
        failedFolders: unreadable,
      },
    };
  }

  const failed: string[] = [];
  for (const dir of sorted) {
    await withFolderLock(dir, async () => {
      try {
        await SidecarService.updateFolderSidecar(dir, (data) => mutate(dir, data));
      } catch (err) {
        console.error(`Failed to save a ${subject} change to the sidecar in ${dir}:`, err);
        failed.push(dir);
        return;
      }
      await reapplyFolder(dir);
    });
  }
  if (failed.length > 0) {
    return {
      status: 500,
      body: {
        ...apiError('sidecar_write_failed', `Could not write .paloma.json in ${failed.join(', ')}`, { folders: failed.join(', ') }),
        failedFolders: failed,
      },
    };
  }
  return null;
}
