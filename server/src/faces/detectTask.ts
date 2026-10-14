import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { FacesTaskDetails } from '../../../shared/types.js';
import type { Principal } from '../auth/principal.js';
import { andVisible, currentAccess } from '../auth/scope.js';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked } from '../db/query.js';
import { folders, photos } from '../db/schema.js';
import { fail } from '../services/apiError.js';
import { pendingPhotos, saveDetectedFaces } from '../services/faceDetectionApi.js';
import { renderFaceSource } from '../services/faceImages.js';
import { parsePhotoIds } from '../services/folderChanges.js';
import { redactPaths } from '../services/redact.js';
import { TaskFailed, taskQueue, type TaskRecord, type TaskRun } from '../tasks/queue.js';
import { DETECTOR, faceDetector, type FaceDetector } from './detector.js';

/** What a face detection task works on. */
interface FacesParams {
  photoIds: number[];
}

const MAX_FAILURES_LISTED = 20;

/** The detector tasks use; replaced in tests. */
export const detection: { detector: FaceDetector } = { detector: faceDetector };

/** The listed photos the current access sees that are not detected with the current detector on their content. */
async function stillPending(ids: number[]): Promise<number[]> {
  const result = await pendingPhotos({ photoIds: ids, detector: DETECTOR });
  return result.status === 200 ? result.body.pending : [];
}

/**
 * `POST /api/faces/detect {photoIds}` in the current request's access: adds a face detection task for the photos
 * that still need it; null when none does.
 */
export async function startFaceDetection(body: unknown, principal: Principal): Promise<TaskRecord<FacesParams, FacesTaskDetails> | null> {
  const ids = parsePhotoIds(typeof body === 'object' && body !== null ? (body as Record<string, unknown>).photoIds : undefined);
  if (!ids) fail(400, 'photo_ids_required', 'photoIds must be a non-empty array of photo ids');
  const pending = await stillPending(ids);
  if (pending.length === 0) return null;
  return taskQueue.add<FacesParams, FacesTaskDetails>({
    kind: 'faces',
    owner: principal.user ? { id: principal.user.id, name: principal.user.displayName } : null,
    subject: { photoCount: pending.length },
    params: { photoIds: pending },
    access: currentAccess(),
    details: { kind: 'faces', faces: 0, photos: 0, failures: [], photoIds: [] },
    total: pending.length,
  });
}

/** Detects the faces of the task's photos one at a time, saving each photo's result as soon as it is done. */
async function runFacesTask(context: TaskRun<FacesParams, FacesTaskDetails>): Promise<void> {
  const { task } = context;
  const remaining = await stillPending(task.params.photoIds);
  task.total = task.done + remaining.length;
  context.progress();
  if (remaining.length === 0) return;
  try {
    await detection.detector.prepare();
  } catch (err) {
    throw new TaskFailed(`The face detector could not be loaded: ${err instanceof Error ? err.message : String(err)}`);
  }

  const rows = await chunked(remaining, BATCH_SIZE, (chunk) => all(db.select({
    id: photos.id, filename: photos.filename, folderPath: folders.path, fileHash: photos.fileHash,
  })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(andVisible(inArray(photos.id, chunk)))));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const { details } = task;

  for (const id of remaining) {
    if (context.stopping()) return;
    const photo = byId.get(id);
    try {
      if (!photo) throw new Error('Photo not found');
      const filePath = path.join(photo.folderPath, photo.filename);
      const faces = await detection.detector.detect(await renderFaceSource(filePath, photo.fileHash));
      const saved = await saveDetectedFaces(id, { detector: DETECTOR, fileHash: photo.fileHash, faces });
      if (saved.status !== 200) throw new Error('error' in saved.body ? saved.body.error : 'Not saved');
      details.faces += faces.length;
      if (faces.length > 0) details.photos += 1;
    } catch (err) {
      task.failed += 1;
      if (details.failures.length < MAX_FAILURES_LISTED) details.failures.push({ photoId: id, message: redactPaths(err instanceof Error ? err.message : String(err)) });
    }
    task.done += 1;
    details.photoIds.push(id);
    context.progress();
  }
}

taskQueue.register({ kind: 'faces', run: runFacesTask });
