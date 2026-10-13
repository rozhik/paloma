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
import { fail } from './apiError.js';
import { exportSpaceOf, fits, requireSpace, type ExportSpace } from '../auth/exportSpace.js';
import { folderSize, quotaLimits } from '../auth/quotas.js';
import { andVisible, currentAccess } from '../auth/scope.js';
import type { Principal } from '../auth/principal.js';
import type { ExportTaskDetails } from '../../../shared/types.js';
import { taskQueue, type TaskRecord, type TaskRun } from '../tasks/queue.js';

/** What an export task works on. */
interface ExportParams {
  /** Visible photos to export, in the order asked */
  photoIds: number[];
  /** The export folder of the owner, and the folder inside it the files go to */
  root: string;
  destination: string;
  /** The owner whose export space quota applies; null when there is none (auth off) */
  quotaUserId: string | null;
  quality: number;
  resizeWidth: number | null;
  /** How many of `photoIds` are done */
  next: number;
}

/**
 * `POST /api/export {photoIds, outputDir, quality, resizeWidth}`: checks the request, the destination (inside the
 * principal's export folder) and that the export space is not already full (409 `quota_exceeded`), then adds an
 * export task. Photos the principal cannot see are left out.
 */
export async function startExport(body: unknown, principal: Principal): Promise<TaskRecord<ExportParams, ExportTaskDetails>> {
  const { photoIds, outputDir, quality = 85, resizeWidth } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!photoIds || !Array.isArray(photoIds) || !outputDir) {
    fail(400, 'export_params_required', 'photoIds array and outputDir are required');
  }
  const jpegQuality = Number(quality);
  if (!Number.isInteger(jpegQuality) || jpegQuality < 1 || jpegQuality > 100) {
    fail(400, 'invalid_field', 'quality must be a whole number from 1 to 100', { field: 'quality' });
  }

  // Exports stay inside the export folder (the user's own one when auth is on): the destination is relative to it
  const space = await exportSpaceOf(principal);
  const destination = typeof outputDir === 'string' ? resolveInside(space.root, outputDir) : null;
  if (destination === null) fail(400, 'invalid_field', 'outputDir must be a folder inside the export folder', { field: 'outputDir' });
  requireSpace(space);

  const ids = photoIds.map(Number).filter((id) => Number.isInteger(id));
  const visible = new Set((await chunked(ids, BATCH_SIZE, (chunk) => all(db.select({ id: photos.id }).from(photos)
    .where(andVisible(inArray(photos.id, chunk)))))).map((row) => row.id));
  const list = ids.filter((id) => visible.has(id));
  const width = Number(resizeWidth);

  return taskQueue.add<ExportParams, ExportTaskDetails>({
    kind: 'export',
    owner: principal.user ? { id: principal.user.id, name: principal.user.displayName } : null,
    subject: { photoCount: photoIds.length },
    params: {
      photoIds: list, root: space.root, destination, quotaUserId: principal.user?.id ?? null,
      quality: jpegQuality, resizeWidth: resizeWidth && width > 0 ? width : null, next: 0,
    },
    access: currentAccess(),
    details: { kind: 'export', outputDir: path.relative(space.root, destination) || '.', files: [], quotaExceeded: false },
    total: list.length,
  });
}

/** The owner's export space as it is now. */
async function spaceNow(params: ExportParams): Promise<ExportSpace> {
  const limit = params.quotaUserId ? (await quotaLimits(params.quotaUserId)).export_bytes : null;
  return { root: params.root, limit, used: limit === null ? 0 : await folderSize(params.root) };
}

/**
 * Writes the photos, rendered at full size through their edits and then resized, as JPEG into the destination,
 * one at a time. The export space is checked again: the task stops before the file that would not fit.
 */
async function runExportTask(context: TaskRun<ExportParams, ExportTaskDetails>): Promise<void> {
  const { task } = context;
  const { params, details } = task;
  const space = await spaceNow(params);
  if (space.limit !== null && space.used >= space.limit) {
    details.quotaExceeded = true;
    return;
  }
  const rest = params.photoIds.slice(params.next);
  const rows = await chunked(rest, BATCH_SIZE, (ids) => all(db.select({ photo: photos, folder: folders, edit: edits })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(andVisible(inArray(photos.id, ids)))));
  const byId = new Map(rows.map((row) => [row.photo.id, row]));
  await fs.promises.mkdir(params.destination, { recursive: true });

  for (const id of rest) {
    if (context.stopping()) return;
    const row = byId.get(id);
    if (row) {
      const { photo, folder, edit } = row;
      const srcPath = path.join(folder.path, photo.filename);
      const destPath = path.join(params.destination, `exported_${photo.filename}`);
      try {
        // Full size through the photo's edits, before any resizing chosen for the export
        let pipeline = await RenderService.render(srcPath, parseEditsJson(edit?.editInstructionsJson) ?? [], { lookup: libraryLookup, label: srcPath });
        if (params.resizeWidth) pipeline = pipeline.resize({ width: params.resizeWidth, withoutEnlargement: true });
        // Rendered first, so the export stops before the file that would not fit
        const image = await pipeline.jpeg({ quality: params.quality }).toBuffer();
        if (!fits(space, image.length)) {
          details.quotaExceeded = true;
          return;
        }
        await fs.promises.writeFile(destPath, image);
        space.used += image.length;
        details.files.push(path.relative(params.root, destPath));
      } catch (err) {
        console.error(`Failed to export ${srcPath}:`, err);
        task.failed += 1;
      }
    } else {
      task.failed += 1;
    }
    params.next += 1;
    task.done += 1;
    context.progress();
  }
}

taskQueue.register({ kind: 'export', run: runExportTask });
