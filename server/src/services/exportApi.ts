import fs from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked } from '../db/query.js';
import { edits, folders, photos } from '../db/schema.js';
import { RenderService } from './RenderService.js';
import { libraryLookup } from './libraryImages.js';
import { parseEditsJson } from './photoImages.js';
import { resolveInside } from './outputPaths.js';
import { apiError } from './apiError.js';
import { exportSpaceOf, fits, requireSpace } from '../auth/exportSpace.js';
import { andVisible } from '../auth/scope.js';
import type { Principal } from '../auth/principal.js';
import type { ApiError } from '../../../shared/types.js';

export interface ExportResult {
  success: boolean;
  count: number;
  requested: number;
  /** Absolute paths of the written files */
  exportedFiles: string[];
  quotaExceeded?: true;
}

/**
 * `POST /api/export`: writes the photos, rendered at full size through their edits and then resized, as JPEG
 * into a folder inside the principal's export folder. Stops before the file that would exceed the export quota;
 * throws a 409 `quota_exceeded` when the space is already full.
 */
export async function exportPhotos(body: unknown, principal: Principal): Promise<{ status: 200; body: ExportResult } | { status: 400; body: ApiError }> {
  const { photoIds, outputDir, quality = 85, resizeWidth } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  if (!photoIds || !Array.isArray(photoIds) || !outputDir) {
    return { status: 400, body: apiError('export_params_required', 'photoIds array and outputDir are required') };
  }

  // Exports stay inside the export folder (the user's own one when auth is on): the destination is relative to it
  const space = await exportSpaceOf(principal);
  const destination = typeof outputDir === 'string' ? resolveInside(space.root, outputDir) : null;
  if (destination === null) {
    return { status: 400, body: apiError('invalid_field', 'outputDir must be a folder inside the export folder', { field: 'outputDir' }) };
  }
  requireSpace(space);

  const selectedPhotos = await chunked(photoIds, BATCH_SIZE, (ids) => all(db.select({
    photo: photos,
    folder: folders,
    edit: edits,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(andVisible(inArray(photos.id, ids)))));
  await fs.promises.mkdir(destination, { recursive: true });

  const exportedFiles: string[] = [];
  let quotaExceeded = false;

  for (const { photo, folder, edit } of selectedPhotos) {
    const srcPath = path.join(folder.path, photo.filename);
    const destPath = path.join(destination, `exported_${photo.filename}`);

    // Full size through the photo's edits, before any resizing chosen for the export
    let pipeline = await RenderService.render(srcPath, parseEditsJson(edit?.editInstructionsJson) ?? [], {
      lookup: libraryLookup,
      label: srcPath,
    });

    if (resizeWidth && Number(resizeWidth) > 0) {
      pipeline = pipeline.resize({ width: Number(resizeWidth), withoutEnlargement: true });
    }

    // Rendered first, so the export stops before the file that would not fit
    const image = await pipeline.jpeg({ quality: Number(quality) }).toBuffer();
    if (!fits(space, image.length)) {
      quotaExceeded = true;
      break;
    }
    await fs.promises.writeFile(destPath, image);
    space.used += image.length;
    exportedFiles.push(destPath);
  }

  return {
    status: 200,
    body: { success: !quotaExceeded, count: exportedFiles.length, requested: photoIds.length, exportedFiles, ...(quotaExceeded ? { quotaExceeded: true as const } : {}) },
  };
}

/** The export folder of a principal, for showing exported paths relative to it. */
export async function exportRootOf(principal: Principal): Promise<string> {
  return (await exportSpaceOf(principal)).root;
}
