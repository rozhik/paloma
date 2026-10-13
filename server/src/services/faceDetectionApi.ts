import { and, asc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked, eachBatch, get, run, withTransaction } from '../db/query.js';
import { detectedFaces, faceDetections, faceDismissals, folders, persons, photoFaces, photos } from '../db/schema.js';
import { apiError } from './apiError.js';
import type { ApiResult } from './photoApi.js';
import { SidecarService, isRelativeRect } from './SidecarService.js';
import { parsePhotoIds, reapplyFolder } from './folderChanges.js';
import { withFolderLock } from './folderLock.js';
import {
  DESCRIPTOR_LENGTH, SIMILAR_DISTANCE, assignDetected, decodeDescriptor, encodeDescriptor, nearest, type MarkRect,
} from './faceMatch.js';
import type { AssignFacesResult, DetectedFaceInput, RelativeRect, SimilarFaces, UnassignedFaces } from '../../../shared/types.js';
import { andVisible, visiblePhotoCondition } from '../auth/scope.js';
import { isPersonVisible } from './people.js';

export const MAX_FACES_PER_PHOTO = 100;
export const MAX_SIMILAR = 200;
const MAX_DETECTOR = 100;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const personExists = async (id: string) =>
  await get(db.select({ id: persons.contactId }).from(persons).where(eq(persons.contactId, id))) !== undefined;

const personNotFound = () => ({ status: 404 as const, body: apiError('person_not_found', 'Person not found') });

/**
 * `{photoIds, detector}`: the listed photos that still need face detection, in the
 * order given: not detected with this detector on their current content. Ids not in the library are left out.
 */
export async function pendingPhotos(body: unknown): Promise<ApiResult<{ pending: number[] }>> {
  const { photoIds, detector } = (isObject(body) ? body : {}) as Record<string, unknown>;
  const ids = parsePhotoIds(photoIds);
  if (!ids) return { status: 400, body: apiError('photo_ids_required', 'photoIds must be a non-empty array of photo ids') };
  if (typeof detector !== 'string' || detector === '' || detector.length > MAX_DETECTOR) {
    return { status: 400, body: apiError('invalid_field', 'detector must be a non-empty string', { field: 'detector' }) };
  }
  const done = new Set<number>();
  const known = new Set<number>();
  const rows = await chunked(ids, BATCH_SIZE, (chunk) => all(db.select({
    id: photos.id, fileHash: photos.fileHash, detector: faceDetections.detector, detectedHash: faceDetections.fileHash,
  })
    .from(photos)
    .leftJoin(faceDetections, eq(faceDetections.photoId, photos.id))
    .where(andVisible(inArray(photos.id, chunk)))));
  for (const row of rows) {
    known.add(row.id);
    if (row.detector === detector && row.detectedHash === row.fileHash) done.add(row.id);
  }
  return { status: 200, body: { pending: ids.filter((id) => known.has(id) && !done.has(id)) } };
}

/** The faces of a detection result, or an error naming what is wrong. */
function parseFaces(value: unknown): DetectedFaceInput[] | string {
  if (!Array.isArray(value) || value.length > MAX_FACES_PER_PHOTO) return `faces must be an array of at most ${MAX_FACES_PER_PHOTO} faces`;
  const faces: DetectedFaceInput[] = [];
  for (const face of value) {
    if (!isObject(face)) return 'each face must be an object';
    const { rect, score, descriptor } = face;
    if (!isRelativeRect(rect) || rect.left >= rect.right || rect.top >= rect.bottom) return 'rect must be {left, top, right, bottom} fractions in order';
    if (typeof score !== 'number' || !(score >= 0 && score <= 1)) return 'score must be a number from 0 to 1';
    if (!Array.isArray(descriptor) || descriptor.length !== DESCRIPTOR_LENGTH || !descriptor.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return `descriptor must be ${DESCRIPTOR_LENGTH} numbers`;
    }
    faces.push({ rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }, score, descriptor });
  }
  return faces;
}

/**
 * `{detector, fileHash, faces}`: replaces the faces detected on the photo by a face detection task. `fileHash`
 * is the content detected on; a result for older content is refused. Writes no files.
 */
export async function saveDetectedFaces(photoId: number, body: unknown): Promise<ApiResult<{ faces: number }>> {
  const { detector, fileHash, faces: rawFaces } = (isObject(body) ? body : {}) as Record<string, unknown>;
  if (typeof detector !== 'string' || detector === '' || detector.length > MAX_DETECTOR) {
    return { status: 400, body: apiError('invalid_field', 'detector must be a non-empty string', { field: 'detector' }) };
  }
  const faces = parseFaces(rawFaces);
  if (typeof faces === 'string') return { status: 400, body: apiError('invalid_field', faces, { field: 'faces' }) };
  const photo = Number.isInteger(photoId) ? await get(db.select().from(photos).where(andVisible(eq(photos.id, photoId)))) : undefined;
  if (!photo) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };
  if (fileHash !== photo.fileHash) {
    return { status: 409, body: apiError('invalid_field', 'The photo changed since it was detected', { field: 'fileHash' }) };
  }

  await withTransaction(async (tx) => {
    const old = tx.select({ id: detectedFaces.id }).from(detectedFaces).where(eq(detectedFaces.photoId, photoId));
    await run(tx.delete(faceDismissals).where(inArray(faceDismissals.faceId, old)));
    await run(tx.delete(detectedFaces).where(eq(detectedFaces.photoId, photoId)));
    for (const face of faces) {
      await run(tx.insert(detectedFaces).values({
        photoId, rect: JSON.stringify(face.rect), score: face.score, descriptor: encodeDescriptor(face.descriptor),
      }));
    }
    const detection = { detector, fileHash: photo.fileHash, detectedAt: new Date().toISOString() };
    await run(tx.insert(faceDetections).values({ photoId, ...detection })
      .onConflictDoUpdate({ target: faceDetections.photoId, set: detection }));
  });
  return { status: 200, body: { faces: faces.length } };
}

interface StoredFace {
  id: number;
  photoId: number;
  rect: RelativeRect;
  descriptor: Buffer;
  isHidden: boolean;
  dateTaken: string | null;
}

type OwnedFace = StoredFace & { owner: string | undefined };

/**
 * Every face detected on the current content of the photos, with the person each belongs to, if any; one
 * batch of photos at a time, so memory stays bounded by the batch size.
 */
async function* facesWithOwners(): AsyncGenerator<OwnedFace[]> {
  const pages = eachBatch(BATCH_SIZE, (afterId, size) => db.select({ id: photos.id, isHidden: photos.isHidden, dateTaken: photos.dateTaken })
    .from(photos)
    .innerJoin(faceDetections, and(eq(faceDetections.photoId, photos.id), eq(faceDetections.fileHash, photos.fileHash)))
    .where(and(gt(photos.id, afterId), visiblePhotoCondition()))
    .orderBy(asc(photos.id))
    .limit(size));
  for await (const page of pages) {
    const ids = page.map((photo) => photo.id);
    const shown = new Map(page.map((photo) => [photo.id, photo]));
    const faces: StoredFace[] = (await all(db.select({
      id: detectedFaces.id, photoId: detectedFaces.photoId, rect: detectedFaces.rect, descriptor: detectedFaces.descriptor,
    })
      .from(detectedFaces)
      .where(inArray(detectedFaces.photoId, ids))
      .orderBy(asc(detectedFaces.id))))
      .map((face) => ({ ...face, rect: JSON.parse(face.rect) as RelativeRect, ...shownOf(shown.get(face.photoId)!) }));

    const marks = new Map<number, MarkRect[]>();
    const markRows = await all(db.select({ photoId: photoFaces.photoId, contactId: photoFaces.contactId, rect: photoFaces.rect })
      .from(photoFaces)
      .where(and(inArray(photoFaces.photoId, ids), isNotNull(photoFaces.rect))));
    for (const mark of markRows) {
      marks.set(mark.photoId, [...(marks.get(mark.photoId) ?? []), { contactId: mark.contactId, rect: JSON.parse(mark.rect!) }]);
    }
    const byPhoto = new Map<number, StoredFace[]>();
    for (const face of faces) byPhoto.set(face.photoId, [...(byPhoto.get(face.photoId) ?? []), face]);
    const owners = new Map<number, string>();
    for (const [photoId, photoFacesList] of byPhoto) {
      for (const [faceId, owner] of assignDetected(photoFacesList, marks.get(photoId) ?? [])) owners.set(faceId, owner);
    }
    yield faces.map((face) => ({ ...face, owner: owners.get(face.id) }));
  }
}

const shownOf = (photo: { isHidden: boolean; dateTaken: string | null }) => ({ isHidden: photo.isHidden, dateTaken: photo.dateTaken });

/** The first `limit` items in `compare` order, kept while items stream in; memory stays O(limit). */
class Best<T> {
  private items: T[] = [];

  constructor(private readonly limit: number, private readonly compare: (a: T, b: T) => number) {}

  add(item: T): void {
    if (this.limit === 0) return;
    this.items.push(item);
    if (this.items.length >= 2 * this.limit) this.trim();
  }

  result(): T[] {
    this.trim();
    return this.items;
  }

  private trim(): void {
    this.items.sort(this.compare);
    this.items.length = Math.min(this.items.length, this.limit);
  }
}

/**
 * `GET /api/people/:id/similar`: unassigned faces on photos that are not hidden whose descriptor is within
 * SIMILAR_DISTANCE of one of the person's detected faces, the most similar first, leaving out faces dismissed
 * for this person.
 */
export async function similarFaces(id: string, limitValue: unknown): Promise<ApiResult<SimilarFaces>> {
  if (!await personExists(id) || !await isPersonVisible(id)) return personNotFound();
  const limit = limitValue === undefined ? MAX_SIMILAR : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SIMILAR) {
    return { status: 400, body: apiError('invalid_field', `limit must be an integer from 1 to ${MAX_SIMILAR}`, { field: 'limit' }) };
  }
  // Two passes over the faces: the person's own faces first, then the candidates compared with them
  const references: Float32Array[] = [];
  for await (const faces of facesWithOwners()) {
    for (const face of faces) if (face.owner === id) references.push(decodeDescriptor(face.descriptor));
  }
  if (references.length === 0) return { status: 200, body: { noReference: true, faces: [] } };

  const dismissed = new Set((await all(db.select({ id: faceDismissals.faceId }).from(faceDismissals)
    .where(eq(faceDismissals.contactId, id)))).map((row) => row.id));
  const similar = new Best<SimilarFaces['faces'][number]>(limit, (a, b) => a.distance - b.distance || a.id - b.id);
  for await (const faces of facesWithOwners()) {
    for (const face of faces) {
      if (face.owner !== undefined || face.isHidden || dismissed.has(face.id)) continue;
      const distance = nearest(decodeDescriptor(face.descriptor), references);
      if (distance <= SIMILAR_DISTANCE) similar.add({ id: face.id, photoId: face.photoId, rect: face.rect, distance });
    }
  }
  return { status: 200, body: { noReference: false, faces: similar.result() } };
}

export const MAX_UNASSIGNED = 500;

/**
 * `GET /api/faces/unassigned?limit=`: detected faces that belong to no person, on photos that are not hidden,
 * the newest photos first; `total` counts all of them. `limit=0` gives only the count.
 */
export async function unassignedFaces(limitValue: unknown): Promise<ApiResult<UnassignedFaces>> {
  const limit = limitValue === undefined ? MAX_UNASSIGNED : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_UNASSIGNED) {
    return { status: 400, body: apiError('invalid_field', `limit must be an integer from 0 to ${MAX_UNASSIGNED}`, { field: 'limit' }) };
  }
  let total = 0;
  const newest = new Best<OwnedFace>(limit, (a, b) =>
    (b.dateTaken ?? '').localeCompare(a.dateTaken ?? '') || b.photoId - a.photoId || a.id - b.id);
  for await (const faces of facesWithOwners()) {
    for (const face of faces) {
      if (face.owner !== undefined || face.isHidden) continue;
      total++;
      newest.add(face);
    }
  }
  return {
    status: 200,
    body: { total, faces: newest.result().map(({ id, photoId, rect }) => ({ id, photoId, rect })) },
  };
}

/**
 * `POST /api/people/:id/faces {faceIds}`: assigns detected faces to the person, writing a face with each
 * face's rectangle to its photo's sidecar entry, folder by folder. Faces in folders that cannot be written are
 * reported as failed; the others are assigned.
 */
export async function assignFaces(id: string, body: unknown): Promise<ApiResult<AssignFacesResult>> {
  const faceIds = parsePhotoIds(isObject(body) ? body.faceIds : undefined);
  if (!faceIds) return { status: 400, body: apiError('invalid_field', 'faceIds must be a non-empty array of face ids', { field: 'faceIds' }) };
  if (!await personExists(id)) return personNotFound();
  const faces = await chunked(faceIds, BATCH_SIZE, (chunk) => all(db.select({
    id: detectedFaces.id, rect: detectedFaces.rect, filename: photos.filename, folderPath: folders.path,
  })
    .from(detectedFaces)
    .innerJoin(photos, eq(detectedFaces.photoId, photos.id))
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(andVisible(inArray(detectedFaces.id, chunk)))));
  if (faces.length !== faceIds.length) return { status: 404, body: apiError('face_not_found', 'Face not found') };

  const byFolder = new Map<string, typeof faces>();
  for (const face of faces) byFolder.set(face.folderPath, [...(byFolder.get(face.folderPath) ?? []), face]);
  const result: AssignFacesResult = { assigned: [], failed: [] };
  const modified = new Date().toISOString();
  for (const [dir, folderFaces] of [...byFolder].sort(([a], [b]) => a.localeCompare(b))) {
    await withFolderLock(dir, async () => {
      try {
        await SidecarService.updateFolderSidecar(dir, (data) => folderFaces.reduce(
          (next, face) => SidecarService.patchPhotos(next, { [face.filename]: { addMark: { person: id, rect: JSON.parse(face.rect) } } }, modified),
          data,
        ));
      } catch (err) {
        console.error(`Failed to save marks of ${id} to the sidecar in ${dir}:`, err);
        result.failed.push(...folderFaces.map((face) => face.id));
        return;
      }
      await reapplyFolder(dir);
      result.assigned.push(...folderFaces.map((face) => face.id));
    });
  }
  return { status: 200, body: result };
}

/** `POST /api/people/:id/dismissals {faceIds}`: hides the faces from this person's similar faces. Writes no files. */
export async function dismissFaces(id: string, body: unknown): Promise<ApiResult<{ success: true }>> {
  const faceIds = parsePhotoIds(isObject(body) ? body.faceIds : undefined);
  if (!faceIds) return { status: 400, body: apiError('invalid_field', 'faceIds must be a non-empty array of face ids', { field: 'faceIds' }) };
  if (!await personExists(id)) return personNotFound();
  const existing = await chunked(faceIds, BATCH_SIZE, (chunk) =>
    all(db.select({ id: detectedFaces.id }).from(detectedFaces).innerJoin(photos, eq(detectedFaces.photoId, photos.id))
      .where(andVisible(inArray(detectedFaces.id, chunk)))));
  if (existing.length !== faceIds.length) return { status: 404, body: apiError('face_not_found', 'Face not found') };
  await withTransaction(async (tx) => {
    for (const faceId of faceIds) await run(tx.insert(faceDismissals).values({ faceId, contactId: id }).onConflictDoNothing());
  });
  return { status: 200, body: { success: true } };
}
