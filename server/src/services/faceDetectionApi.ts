import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { detectedFaces, faceDetections, faceDismissals, folders, persons, photoFaces, photos } from '../db/schema.js';
import { apiError } from './apiError.js';
import type { ApiResult } from './photoApi.js';
import { FolderScannerService } from './FolderScannerService.js';
import { SidecarService, isRelativeRect } from './SidecarService.js';
import { parsePhotoIds } from './folderChanges.js';
import {
  DESCRIPTOR_LENGTH, SIMILAR_DISTANCE, assignDetected, decodeDescriptor, encodeDescriptor, nearest, type MarkRect,
} from './faceMatch.js';
import type { AssignFacesResult, DetectedFaceInput, RelativeRect, SimilarFaces, UnassignedFaces } from '../../../shared/types.js';

export const MAX_FACES_PER_PHOTO = 100;
export const MAX_SIMILAR = 200;
const MAX_DETECTOR = 100;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const personExists = (id: string) =>
  db.select({ id: persons.contactId }).from(persons).where(eq(persons.contactId, id)).get() !== undefined;

const personNotFound = () => ({ status: 404 as const, body: apiError('person_not_found', 'Person not found') });

/**
 * `POST /api/faces/pending {photoIds, detector}`: the listed photos that still need face detection, in the
 * order given: not detected with this detector on their current content. Ids not in the library are left out.
 */
export function pendingPhotos(body: unknown): ApiResult<{ pending: number[] }> {
  const { photoIds, detector } = (isObject(body) ? body : {}) as Record<string, unknown>;
  const ids = parsePhotoIds(photoIds);
  if (!ids) return { status: 400, body: apiError('photo_ids_required', 'photoIds must be a non-empty array of photo ids') };
  if (typeof detector !== 'string' || detector === '' || detector.length > MAX_DETECTOR) {
    return { status: 400, body: apiError('invalid_field', 'detector must be a non-empty string', { field: 'detector' }) };
  }
  const done = new Set<number>();
  const known = new Set<number>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db.select({ id: photos.id, fileHash: photos.fileHash, detector: faceDetections.detector, detectedHash: faceDetections.fileHash })
      .from(photos)
      .leftJoin(faceDetections, eq(faceDetections.photoId, photos.id))
      .where(inArray(photos.id, chunk))
      .all();
    for (const row of rows) {
      known.add(row.id);
      if (row.detector === detector && row.detectedHash === row.fileHash) done.add(row.id);
    }
  }
  return { status: 200, body: { pending: ids.filter((id) => known.has(id) && !done.has(id)) } };
}

/** The faces of a `PUT detected-faces` body, or an error naming what is wrong. */
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
 * `PUT /api/photos/:id/detected-faces {detector, fileHash, faces}`: replaces the faces detected on the photo.
 * `fileHash` is the content the browser detected on; a result for older content is refused. Writes no files.
 */
export function saveDetectedFaces(photoId: number, body: unknown): ApiResult<{ faces: number }> {
  const { detector, fileHash, faces: rawFaces } = (isObject(body) ? body : {}) as Record<string, unknown>;
  if (typeof detector !== 'string' || detector === '' || detector.length > MAX_DETECTOR) {
    return { status: 400, body: apiError('invalid_field', 'detector must be a non-empty string', { field: 'detector' }) };
  }
  const faces = parseFaces(rawFaces);
  if (typeof faces === 'string') return { status: 400, body: apiError('invalid_field', faces, { field: 'faces' }) };
  const photo = Number.isInteger(photoId) ? db.select().from(photos).where(eq(photos.id, photoId)).get() : undefined;
  if (!photo) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };
  if (fileHash !== photo.fileHash) {
    return { status: 409, body: apiError('invalid_field', 'The photo changed since it was detected', { field: 'fileHash' }) };
  }

  db.transaction((tx) => {
    const old = tx.select({ id: detectedFaces.id }).from(detectedFaces).where(eq(detectedFaces.photoId, photoId));
    tx.delete(faceDismissals).where(inArray(faceDismissals.faceId, old)).run();
    tx.delete(detectedFaces).where(eq(detectedFaces.photoId, photoId)).run();
    for (const face of faces) {
      tx.insert(detectedFaces).values({
        photoId, rect: JSON.stringify(face.rect), score: face.score, descriptor: encodeDescriptor(face.descriptor),
      }).run();
    }
    const detection = { detector, fileHash: photo.fileHash, detectedAt: new Date().toISOString() };
    tx.insert(faceDetections).values({ photoId, ...detection })
      .onConflictDoUpdate({ target: faceDetections.photoId, set: detection }).run();
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

/** Every face detected on the current content of the photos, with the person each belongs to, if any. */
function facesWithOwners(): Array<StoredFace & { owner: string | undefined }> {
  const faces: StoredFace[] = db.select({
    id: detectedFaces.id, photoId: detectedFaces.photoId, rect: detectedFaces.rect, descriptor: detectedFaces.descriptor,
    isHidden: photos.isHidden, dateTaken: photos.dateTaken,
  })
    .from(detectedFaces)
    .innerJoin(photos, eq(detectedFaces.photoId, photos.id))
    .innerJoin(faceDetections, and(eq(faceDetections.photoId, photos.id), eq(faceDetections.fileHash, photos.fileHash)))
    .all()
    .map((face) => ({ ...face, rect: JSON.parse(face.rect) as RelativeRect }));

  const marks = new Map<number, MarkRect[]>();
  const markRows = db.select({ photoId: photoFaces.photoId, contactId: photoFaces.contactId, rect: photoFaces.rect }).from(photoFaces).all();
  for (const mark of markRows) {
    if (!mark.rect) continue;
    marks.set(mark.photoId, [...(marks.get(mark.photoId) ?? []), { contactId: mark.contactId, rect: JSON.parse(mark.rect) }]);
  }
  const byPhoto = new Map<number, StoredFace[]>();
  for (const face of faces) byPhoto.set(face.photoId, [...(byPhoto.get(face.photoId) ?? []), face]);
  const owners = new Map<number, string>();
  for (const [photoId, photoFacesList] of byPhoto) {
    for (const [faceId, owner] of assignDetected(photoFacesList, marks.get(photoId) ?? [])) owners.set(faceId, owner);
  }
  return faces.map((face) => ({ ...face, owner: owners.get(face.id) }));
}

/**
 * `GET /api/people/:id/similar`: unassigned faces on photos that are not hidden whose descriptor is within
 * SIMILAR_DISTANCE of one of the person's detected faces, the most similar first, leaving out faces dismissed
 * for this person.
 */
export function similarFaces(id: string, limitValue: unknown): ApiResult<SimilarFaces> {
  if (!personExists(id)) return personNotFound();
  const limit = limitValue === undefined ? MAX_SIMILAR : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SIMILAR) {
    return { status: 400, body: apiError('invalid_field', `limit must be an integer from 1 to ${MAX_SIMILAR}`, { field: 'limit' }) };
  }
  const faces = facesWithOwners();
  const references = faces.filter((face) => face.owner === id).map((face) => decodeDescriptor(face.descriptor));
  if (references.length === 0) return { status: 200, body: { noReference: true, faces: [] } };

  const dismissed = new Set(db.select({ id: faceDismissals.faceId }).from(faceDismissals)
    .where(eq(faceDismissals.contactId, id)).all().map((row) => row.id));
  const similar = faces
    .filter((face) => face.owner === undefined && !face.isHidden && !dismissed.has(face.id))
    .map((face) => ({ id: face.id, photoId: face.photoId, rect: face.rect, distance: nearest(decodeDescriptor(face.descriptor), references) }))
    .filter((face) => face.distance <= SIMILAR_DISTANCE)
    .sort((a, b) => a.distance - b.distance || a.id - b.id)
    .slice(0, limit);
  return { status: 200, body: { noReference: false, faces: similar } };
}

export const MAX_UNASSIGNED = 500;

/**
 * `GET /api/faces/unassigned?limit=`: detected faces that belong to no person, on photos that are not hidden,
 * the newest photos first; `total` counts all of them. `limit=0` gives only the count.
 */
export function unassignedFaces(limitValue: unknown): ApiResult<UnassignedFaces> {
  const limit = limitValue === undefined ? MAX_UNASSIGNED : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_UNASSIGNED) {
    return { status: 400, body: apiError('invalid_field', `limit must be an integer from 0 to ${MAX_UNASSIGNED}`, { field: 'limit' }) };
  }
  const free = facesWithOwners()
    .filter((face) => face.owner === undefined && !face.isHidden)
    .sort((a, b) => (b.dateTaken ?? '').localeCompare(a.dateTaken ?? '') || b.photoId - a.photoId || a.id - b.id);
  return {
    status: 200,
    body: { total: free.length, faces: free.slice(0, limit).map(({ id, photoId, rect }) => ({ id, photoId, rect })) },
  };
}

/**
 * `POST /api/people/:id/faces {faceIds}`: assigns detected faces to the person, writing a face with each
 * face's rectangle to its photo's sidecar entry, folder by folder. Faces in folders that cannot be written are
 * reported as failed; the others are assigned.
 */
export function assignFaces(id: string, body: unknown): ApiResult<AssignFacesResult> {
  const faceIds = parsePhotoIds(isObject(body) ? body.faceIds : undefined);
  if (!faceIds) return { status: 400, body: apiError('invalid_field', 'faceIds must be a non-empty array of face ids', { field: 'faceIds' }) };
  if (!personExists(id)) return personNotFound();
  const faces = db.select({ id: detectedFaces.id, rect: detectedFaces.rect, filename: photos.filename, folderPath: folders.path })
    .from(detectedFaces)
    .innerJoin(photos, eq(detectedFaces.photoId, photos.id))
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(inArray(detectedFaces.id, faceIds))
    .all();
  if (faces.length !== faceIds.length) return { status: 404, body: apiError('face_not_found', 'Face not found') };

  const byFolder = new Map<string, typeof faces>();
  for (const face of faces) byFolder.set(face.folderPath, [...(byFolder.get(face.folderPath) ?? []), face]);
  const result: AssignFacesResult = { assigned: [], failed: [] };
  const modified = new Date().toISOString();
  for (const [dir, folderFaces] of [...byFolder].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      SidecarService.updateFolderSidecar(dir, (data) => folderFaces.reduce(
        (next, face) => SidecarService.patchPhotos(next, { [face.filename]: { addMark: { person: id, rect: JSON.parse(face.rect) } } }, modified),
        data,
      ));
    } catch (err) {
      console.error(`Failed to save marks of ${id} to the sidecar in ${dir}:`, err);
      result.failed.push(...folderFaces.map((face) => face.id));
      continue;
    }
    FolderScannerService.applyFolderState(dir, SidecarService.getFolderState(dir));
    result.assigned.push(...folderFaces.map((face) => face.id));
  }
  return { status: 200, body: result };
}

/** `POST /api/people/:id/dismissals {faceIds}`: hides the faces from this person's similar faces. Writes no files. */
export function dismissFaces(id: string, body: unknown): ApiResult<{ success: true }> {
  const faceIds = parsePhotoIds(isObject(body) ? body.faceIds : undefined);
  if (!faceIds) return { status: 400, body: apiError('invalid_field', 'faceIds must be a non-empty array of face ids', { field: 'faceIds' }) };
  if (!personExists(id)) return personNotFound();
  const existing = db.select({ id: detectedFaces.id }).from(detectedFaces).where(inArray(detectedFaces.id, faceIds)).all();
  if (existing.length !== faceIds.length) return { status: 404, body: apiError('face_not_found', 'Face not found') };
  for (const faceId of faceIds) db.insert(faceDismissals).values({ faceId, contactId: id }).onConflictDoNothing().run();
  return { status: 200, body: { success: true } };
}
