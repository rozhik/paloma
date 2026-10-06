import crypto from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { detectedFaces, faceDetections, folderPeople, folders, persons, photoFaces, photoPeople, photos } from '../db/schema.js';
import { assignDetected, type MarkRect } from './faceMatch.js';
import { sameRect } from './SidecarService.js';
import type { DetectedFaceInfo, PhotoPerson, RelativeRect } from '../../../shared/types.js';

/**
 * Names of people by contact id as the folder files give them: the first non-null name in folder path order,
 * from readable sidecars or, for folders without one, their Picasa .ini. Without `ids`, every person any
 * folder defines.
 */
export function personNames(ids?: readonly string[]): Map<string, string | null> {
  const names = new Map<string, string | null>(ids?.map((id) => [id, null]));
  if (ids?.length === 0) return names;
  const rows = db.select({ contactId: folderPeople.contactId, name: folderPeople.name })
    .from(folderPeople)
    .innerJoin(folders, eq(folderPeople.folderId, folders.id))
    .where(ids ? inArray(folderPeople.contactId, [...ids]) : undefined)
    .orderBy(asc(folders.path))
    .all();
  for (const { contactId, name } of rows) {
    if (names.get(contactId) == null) names.set(contactId, name);
  }
  return names;
}

export type PersonRow = typeof persons.$inferSelect;

export interface ShownPerson {
  row: PersonRow | undefined;
  /** The name saved in Paloma once the person was edited there, else the name from the folder files */
  name: string | null;
  alias: string | null;
}

/** How people are shown, by contact id; without `ids`, every person of the library. */
export function shownPeople(ids?: readonly string[]): Map<string, ShownPerson> {
  const rows = ids?.length === 0
    ? []
    : db.select().from(persons).where(ids ? inArray(persons.contactId, [...ids]) : undefined).all();
  // Every person, and contact ids on photos that are not persons yet
  const all = ids ?? [...new Set([
    ...rows.map((row) => row.contactId),
    ...db.selectDistinct({ contactId: photoPeople.contactId }).from(photoPeople).all().map((row) => row.contactId),
  ])];
  const resolved = personNames(all);
  const byId = new Map(rows.map((row) => [row.contactId, row]));
  return new Map(all.map((id) => {
    const row = byId.get(id);
    const name = row?.edited ? row.name : resolved.get(id) ?? null;
    return [id, { row, name, alias: row?.alias ?? null }];
  }));
}

/** A person's face with a rectangle, with where its photo is. */
export interface RectFace {
  contactId: string;
  photoId: number;
  rect: RelativeRect;
  folderPath: string;
  filename: string;
  fileHash: string;
}

/** Faces with a rectangle, in folder path, file name and face order; of one person or of everyone. */
export function rectFaces(contactId?: string): RectFace[] {
  return db.select({
    contactId: photoFaces.contactId, photoId: photoFaces.photoId, rect: photoFaces.rect,
    folderPath: folders.path, filename: photos.filename, fileHash: photos.fileHash,
  })
    .from(photoFaces)
    .innerJoin(photos, eq(photoFaces.photoId, photos.id))
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(and(isNotNull(photoFaces.rect), contactId ? eq(photoFaces.contactId, contactId) : undefined))
    .orderBy(asc(folders.path), asc(photos.filename), asc(photoFaces.position))
    .all()
    .map((face) => ({ ...face, rect: JSON.parse(face.rect!) as RelativeRect }));
}

/** The face the user chose as the person's avatar, while it is still a face of theirs. */
export function chosenFace(row: PersonRow | undefined, faces: readonly RectFace[]): RectFace | undefined {
  if (!row?.avatarFolder || !row.avatarFile || !row.avatarRect) return undefined;
  const rect = JSON.parse(row.avatarRect) as RelativeRect;
  return faces.find((face) => face.folderPath === row.avatarFolder && face.filename === row.avatarFile && sameRect(face.rect, rect));
}

/** The person's avatar face: the chosen one, else their first face with a rectangle. */
export function avatarFace(row: PersonRow | undefined, faces: readonly RectFace[]): RectFace | undefined {
  return chosenFace(row, faces) ?? faces[0];
}

/** Changes whenever the avatar's photo content or rectangle changes. */
export function avatarVersion(face: RectFace | undefined): string | null {
  if (!face) return null;
  return crypto.createHash('sha1').update(`${face.fileHash}:${JSON.stringify(face.rect)}`).digest('hex').slice(0, 12);
}

/** Avatar versions of the given people (or everyone), by contact id. */
export function avatarVersions(people: ReadonlyMap<string, ShownPerson>, contactId?: string): Map<string, string | null> {
  const byPerson = new Map<string, RectFace[]>();
  for (const face of rectFaces(contactId)) byPerson.set(face.contactId, [...(byPerson.get(face.contactId) ?? []), face]);
  return new Map([...people].map(([id, person]) => [id, avatarVersion(avatarFace(person.row, byPerson.get(id) ?? []))]));
}

/** Photos that are not hidden with a face of the person, by contact id. */
export function photoCounts(): Map<string, number> {
  const rows = db.select({ contactId: photoPeople.contactId, count: sql<number>`count(*)` })
    .from(photoPeople)
    .innerJoin(photos, eq(photoPeople.photoId, photos.id))
    .where(eq(photos.isHidden, false))
    .groupBy(photoPeople.contactId)
    .all();
  return new Map(rows.map((row) => [row.contactId, row.count]));
}

/** The people on a photo, in face order, with their shown names and the rectangles of their faces. */
export function peopleOnPhoto(photoId: number): PhotoPerson[] {
  const ids = db.select({ contactId: photoPeople.contactId })
    .from(photoPeople)
    .where(eq(photoPeople.photoId, photoId))
    .orderBy(asc(photoPeople.position))
    .all()
    .map((row) => row.contactId);
  const shown = shownPeople(ids);
  const faces = db.select().from(photoFaces).where(eq(photoFaces.photoId, photoId)).orderBy(asc(photoFaces.position)).all();
  return ids.map((id) => ({
    id,
    name: shown.get(id)?.name ?? null,
    avatarVersion: avatarVersions(new Map([[id, shown.get(id)!]]), id).get(id) ?? null,
    rects: faces.filter((face) => face.contactId === id && face.rect).map((face) => JSON.parse(face.rect!) as RelativeRect),
  }));
}

/** Rectangles of the marks on a photo. */
export function markRects(photoId: number): MarkRect[] {
  return db.select({ contactId: photoFaces.contactId, rect: photoFaces.rect })
    .from(photoFaces)
    .where(and(eq(photoFaces.photoId, photoId), isNotNull(photoFaces.rect)))
    .all()
    .map((mark) => ({ contactId: mark.contactId, rect: JSON.parse(mark.rect!) as RelativeRect }));
}

/** Faces detected on the photo's current content, with their rectangles. */
export function detectedOnPhoto(photoId: number): DetectedFaceInfo[] {
  return db.select({ id: detectedFaces.id, photoId: detectedFaces.photoId, rect: detectedFaces.rect })
    .from(detectedFaces)
    .innerJoin(photos, eq(detectedFaces.photoId, photos.id))
    .innerJoin(faceDetections, and(eq(faceDetections.photoId, photos.id), eq(faceDetections.fileHash, photos.fileHash)))
    .where(eq(detectedFaces.photoId, photoId))
    .orderBy(asc(detectedFaces.id))
    .all()
    .map((face) => ({ ...face, rect: JSON.parse(face.rect) as RelativeRect }));
}

/** Detected faces of the photo that belong to no person. */
export function unassignedFaces(photoId: number): DetectedFaceInfo[] {
  const faces = detectedOnPhoto(photoId);
  const owners = assignDetected(faces, markRects(photoId));
  return faces.filter((face) => !owners.has(face.id));
}
