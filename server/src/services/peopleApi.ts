import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { faceDismissals, folders, persons, photoPeople, photos } from '../db/schema.js';
import { apiError } from './apiError.js';
import { getApiPhoto, savePhotoPatch, type ApiResult } from './photoApi.js';
import { CONTACT_ID, SidecarService, sameRect, withMark, withoutPerson, type FaceMark } from './SidecarService.js';
import { saveFolderByFolder } from './folderChanges.js';
import { parsePersonInput } from './personValidation.js';
import {
  avatarFace, avatarVersion, avatarVersions, chosenFace, detectedOnPhoto, peopleOnPhoto, photoCounts, rectFaces, shownPeople, unassignedFaces,
} from './people.js';
import type { ApiError, Person, PersonFace, PersonInput, PersonSummary, Photo, PhotoPeople } from '../../../shared/types.js';

const IGNORED_CONTACT = 'ffffffffffffffff';

const personNotFound = (): { status: 404; body: ApiError } =>
  ({ status: 404, body: apiError('person_not_found', 'Person not found') });

/** A new random contact id: 16 lowercase hex digits, unused and never Picasa's "ignored" id. */
export function newContactId(exists: (id: string) => boolean = personExists): string {
  for (;;) {
    const id = crypto.randomBytes(8).toString('hex');
    if (id !== IGNORED_CONTACT && !exists(id)) return id;
  }
}

function personExists(id: string): boolean {
  return CONTACT_ID.test(id) && db.select({ id: persons.contactId }).from(persons).where(eq(persons.contactId, id)).get() !== undefined;
}

const parseLinks = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

/** `GET /api/people`: every person of the library with the number of photos they are on. */
export function listPeople(): PersonSummary[] {
  const people = shownPeople();
  const counts = photoCounts();
  const avatars = avatarVersions(people);
  return [...people].map(([id, person]) => ({
    id, name: person.name, alias: person.alias, avatarVersion: avatars.get(id) ?? null, photoCount: counts.get(id) ?? 0,
  }));
}

/** One person with the whole profile; undefined when there is no such person. */
export function findPerson(id: string): Person | undefined {
  if (!personExists(id)) return undefined;
  const person = shownPeople([id]).get(id)!;
  const row = person.row!;
  const faces = rectFaces(id);
  const chosen = chosenFace(row, faces);
  return {
    id,
    name: person.name,
    alias: row.alias,
    comment: row.comment,
    links: parseLinks(row.links),
    birth: row.birth,
    gender: row.gender,
    avatarVersion: avatarVersion(avatarFace(row, faces)),
    avatar: chosen ? { photoId: chosen.photoId, rect: chosen.rect } : null,
    photoCount: photoCounts().get(id) ?? 0,
  };
}

export function getPerson(id: string): ApiResult<Person> {
  const person = findPerson(id);
  return person ? { status: 200, body: person } : personNotFound();
}

/** The person's faces with a rectangle, for choosing the avatar. */
export function listPersonFaces(id: string): ApiResult<PersonFace[]> {
  if (!personExists(id)) return personNotFound();
  return { status: 200, body: rectFaces(id).map(({ photoId, rect }) => ({ photoId, rect })) };
}

type AvatarColumns = Pick<typeof persons.$inferInsert, 'avatarFolder' | 'avatarFile' | 'avatarRect'>;

/** Where the chosen avatar face is, or an error when it is not a face of the person with that rectangle. */
function avatarColumns(id: string, avatar: PersonInput['avatar']): AvatarColumns | ApiError {
  if (avatar === null || avatar === undefined) return { avatarFolder: null, avatarFile: null, avatarRect: null };
  const face = rectFaces(id).find((f) => f.photoId === avatar.photoId && sameRect(f.rect, avatar.rect));
  if (!face) return apiError('invalid_field', 'avatar must be a face of the person with a rectangle', { field: 'avatar' });
  return { avatarFolder: face.folderPath, avatarFile: face.filename, avatarRect: JSON.stringify(face.rect) };
}

/** Profile columns of a validated input; the name is set by the caller. */
function profileColumns(input: PersonInput) {
  return {
    ...(input.alias !== undefined ? { alias: input.alias } : {}),
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(input.links !== undefined ? { links: input.links.length > 0 ? JSON.stringify(input.links) : null } : {}),
    ...(input.birth !== undefined ? { birth: input.birth } : {}),
    ...(input.gender !== undefined ? { gender: input.gender } : {}),
  };
}

/**
 * `POST /api/people`: a new person with a new contact id. With a name it is known and its name is the one
 * saved in Paloma; without one it is unknown. Writes no files.
 */
export function createPerson(body: unknown): ApiResult<Person> {
  const input = parsePersonInput(body ?? {}, false);
  if ('code' in input) return { status: 400, body: input };
  const id = newContactId();
  if (input.avatar) {
    const avatar = avatarColumns(id, input.avatar);
    if ('code' in avatar) return { status: 400, body: avatar };
  }
  db.insert(persons).values({
    contactId: id,
    name: input.name ?? null,
    ...profileColumns(input),
    edited: input.name !== undefined,
    createdAt: new Date().toISOString(),
  }).run();
  return { status: 200, body: findPerson(id)! };
}

/**
 * `PATCH /api/people/:id`: changes the profile. The first edit freezes the shown name: from then on the name
 * saved in Paloma is shown, not the folder files' one. Writes no files.
 */
export function updatePerson(id: string, body: unknown): ApiResult<Person> {
  if (!personExists(id)) return personNotFound();
  const person = shownPeople([id]).get(id)!;
  const input = parsePersonInput(body, person.name !== null);
  if ('code' in input) return { status: 400, body: input };
  if (Object.keys(input).length === 0) return { status: 200, body: findPerson(id)! };

  let avatar: AvatarColumns = {};
  if (input.avatar !== undefined) {
    const columns = avatarColumns(id, input.avatar);
    if ('code' in columns) return { status: 400, body: columns };
    avatar = columns;
  }
  db.update(persons)
    .set({ name: input.name ?? person.name, ...profileColumns(input), ...avatar, edited: true })
    .where(eq(persons.contactId, id))
    .run();
  return { status: 200, body: findPerson(id)! };
}

/**
 * `DELETE /api/people/:id`: removes all of the person's faces from the folders' sidecars, folder by folder,
 * then the person. If a folder cannot be written the person is kept, with the faces that are left.
 */
export function deletePerson(id: string): ApiResult<{ success: true }> {
  if (!personExists(id)) return personNotFound();
  const refs = db.select({ filename: photos.filename, folderPath: folders.path })
    .from(photoPeople)
    .innerJoin(photos, eq(photoPeople.photoId, photos.id))
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(eq(photoPeople.contactId, id))
    .all();
  const files = new Map<string, string[]>();
  for (const ref of refs) files.set(ref.folderPath, [...(files.get(ref.folderPath) ?? []), ref.filename]);

  const modified = new Date().toISOString();
  const failed = saveFolderByFolder('person', [...files.keys()], (dir, data) => SidecarService.patchPhotos(
    data, Object.fromEntries(files.get(dir)!.map((filename) => [filename, { removePerson: id }])), modified,
  ));
  if (failed) return failed;

  db.transaction((tx) => {
    tx.delete(faceDismissals).where(eq(faceDismissals.contactId, id)).run();
    tx.delete(persons).where(eq(persons.contactId, id)).run();
  });
  return { status: 200, body: { success: true } };
}

const photoPeopleOf = (photoId: number): PhotoPeople => ({ people: peopleOnPhoto(photoId), faces: unassignedFaces(photoId) });

/** `GET /api/photos/:id/people`: the people on a photo with their face rectangles, and its unassigned faces. */
export function getPhotoPeople(photoId: number): ApiResult<PhotoPeople> {
  if (!getApiPhoto(photoId)) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };
  return { status: 200, body: photoPeopleOf(photoId) };
}

/** The photo's current faces as its folder files give them. */
function currentFaces(photo: Photo): unknown {
  return SidecarService.getFolderState(photo.folderPath!).photos[photo.filename]?.faces;
}

/**
 * `POST /api/photos/:id/people`: adds `person` to the photo, as a face with the rectangle of the detected face
 * `faceId`, or without a rectangle. A mark that is already there changes nothing.
 */
export function addPersonToPhoto(photoId: number, body: unknown): ApiResult<PhotoPeople> {
  const { person, faceId } = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  if (typeof person !== 'string' || !CONTACT_ID.test(person)) {
    return { status: 400, body: apiError('invalid_field', 'person must be a contact id', { field: 'person' }) };
  }
  if (faceId !== undefined && !Number.isInteger(faceId)) {
    return { status: 400, body: apiError('invalid_field', 'faceId must be a detected face id', { field: 'faceId' }) };
  }
  if (!personExists(person)) return personNotFound();
  const photo = getApiPhoto(photoId);
  if (!photo?.folderPath) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };

  const mark: FaceMark = { person };
  if (faceId !== undefined) {
    const face = detectedOnPhoto(photoId).find((f) => f.id === faceId);
    if (!face) return { status: 404, body: apiError('face_not_found', 'Face not found on this photo') };
    mark.rect = face.rect;
  }
  if (withMark(currentFaces(photo), mark) === undefined) return { status: 200, body: photoPeopleOf(photoId) };
  return savePhotoPatch(photo, { addMark: mark }) ?? { status: 200, body: photoPeopleOf(photoId) };
}

/** `DELETE /api/photos/:id/people/:personId`: removes every face of the person from the photo. */
export function removePersonFromPhoto(photoId: number, person: string): ApiResult<PhotoPeople> {
  const photo = getApiPhoto(photoId);
  if (!photo?.folderPath) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };
  if (withoutPerson(currentFaces(photo), person) === undefined) return { status: 200, body: photoPeopleOf(photoId) };
  return savePhotoPatch(photo, { removePerson: person }) ?? { status: 200, body: photoPeopleOf(photoId) };
}

