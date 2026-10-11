import path from 'node:path';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, BATCH_SIZE, chunked, get } from '../db/query.js';
import { detectedFaces, faceDetections, photoFaces, photos } from '../db/schema.js';
import { listFolders, listPhotos } from '../services/photoApi.js';
import { listAlbums, getAlbum, shownAlbumTexts } from '../services/albumApi.js';
import { getPerson, listPeople } from '../services/peopleApi.js';
import { shownPeople } from '../services/people.js';
import { assignDetected } from '../services/faceMatch.js';
import { listTags } from '../services/tagApi.js';
import { photoFilters, type PhotoFilterQuery } from '../services/photoFilters.js';
import { textKey } from '../services/libraryText.js';
import type {
  Album, AlbumDocument, FolderDocument, ObjectDocument, ObjectList, ObjectType, Person, PersonDocument, Photo, PhotoDocument,
  RelativeRect, TagDocument,
} from '../../../shared/types.js';

// The JSON documents of library objects (object-model capability), built from the same queries as the
// existing API responses. Everything here sees only what the current request may see.

export const OBJECT_TYPES: readonly ObjectType[] = ['photo', 'album', 'person', 'folder', 'tag'];

export const isObjectType = (value: unknown): value is ObjectType => OBJECT_TYPES.includes(value as ObjectType);

/** Place names in documents are in English. */
const PLACE_LANG = 'en';

/** People with a face on each photo, in face order: one item per face, `rect` null for a mark without a frame. */
async function facesOf(photoIds: readonly number[]): Promise<Map<number, { contactId: string; rect: RelativeRect | null }[]>> {
  const rows = await chunked(photoIds, BATCH_SIZE, (chunk) => all(db.select().from(photoFaces)
    .where(inArray(photoFaces.photoId, chunk))
    .orderBy(asc(photoFaces.photoId), asc(photoFaces.position))));
  const byPhoto = new Map<number, { contactId: string; rect: RelativeRect | null }[]>();
  for (const row of rows) {
    const list = byPhoto.get(row.photoId) ?? [];
    list.push({ contactId: row.contactId, rect: row.rect ? JSON.parse(row.rect) as RelativeRect : null });
    byPhoto.set(row.photoId, list);
  }
  return byPhoto;
}

/** Detected faces of the current photo content, by photo. */
async function detectedOf(photoIds: readonly number[]): Promise<Map<number, { id: number; rect: RelativeRect }[]>> {
  const rows = await chunked(photoIds, BATCH_SIZE, (chunk) => all(db.select({ id: detectedFaces.id, photoId: detectedFaces.photoId, rect: detectedFaces.rect })
    .from(detectedFaces)
    .innerJoin(photos, eq(detectedFaces.photoId, photos.id))
    .innerJoin(faceDetections, and(eq(faceDetections.photoId, photos.id), eq(faceDetections.fileHash, photos.fileHash)))
    .where(inArray(detectedFaces.photoId, chunk))
    .orderBy(asc(detectedFaces.id))));
  const byPhoto = new Map<number, { id: number; rect: RelativeRect }[]>();
  for (const row of rows) byPhoto.set(row.photoId, [...(byPhoto.get(row.photoId) ?? []), { id: row.id, rect: JSON.parse(row.rect) as RelativeRect }]);
  return byPhoto;
}

/** Photo documents of API photos, in the same order. */
export async function photoDocuments(list: readonly Photo[]): Promise<PhotoDocument[]> {
  if (list.length === 0) return [];
  const ids = list.map((photo) => photo.id);
  const albumNames = list.some((photo) => photo.albums.length > 0) ? await shownAlbumTexts() : new Map();
  const faces = await facesOf(ids);
  const detected = await detectedOf(ids);
  const contactIds = [...new Set([...faces.values()].flat().map((face) => face.contactId))];
  const people = contactIds.length > 0 ? await shownPeople(contactIds) : new Map();

  return list.map((photo) => {
    const photoFacesList = faces.get(photo.id) ?? [];
    const marks = photoFacesList.filter((face) => face.rect !== null).map((face) => ({ contactId: face.contactId, rect: face.rect! }));
    const found = detected.get(photo.id) ?? [];
    const owners = assignDetected(found, marks);
    return {
      type: 'photo',
      id: photo.id,
      folder: { id: photo.folderId, path: photo.folderPath! },
      fileName: photo.filename,
      width: photo.width,
      height: photo.height,
      fileSize: photo.fileSize,
      takenAt: photo.dateTaken,
      star: photo.isStarred,
      hidden: photo.isHidden,
      caption: photo.caption || null,
      tags: photo.keywords,
      location: photo.latitude !== null && photo.longitude !== null ? { lat: photo.latitude, lon: photo.longitude } : null,
      locationSource: photo.locationSource,
      place: photo.place ?? null,
      albums: photo.albums.map((token) => ({ id: token, name: albumNames.get(token)?.name ?? null })),
      people: photoFacesList.map((face) => ({ id: face.contactId, name: people.get(face.contactId)?.name ?? null, rect: face.rect })),
      detectedFaces: found.filter((face) => !owners.has(face.id)),
      edits: photo.edits ?? [],
      modified: (photo.edits ?? []).length > 0,
    } satisfies PhotoDocument;
  });
}

/** Photo documents of the given ids that the current request may see, in the order of the ids. */
export async function photoDocumentsById(ids: readonly number[]): Promise<PhotoDocument[]> {
  if (ids.length === 0) return [];
  const rows = await chunked(ids, BATCH_SIZE, (chunk) => listPhotos({ ids: chunk.join(','), includeHidden: 'true', lang: PLACE_LANG, limit: String(chunk.length) }));
  const byId = new Map(rows.map((photo) => [photo.id, photo]));
  return photoDocuments(ids.map((id) => byId.get(id)).filter((photo): photo is Photo => photo !== undefined));
}

export function albumDocument(album: Album): AlbumDocument {
  return {
    type: 'album',
    id: album.token,
    name: album.name,
    date: album.date,
    description: album.description,
    location: album.location,
    cover: album.coverPhotoId,
    photoCount: album.photoCount,
  };
}

export function personDocument(person: Person): PersonDocument {
  return {
    type: 'person',
    id: person.id,
    name: person.name,
    alias: person.alias,
    comment: person.comment,
    links: person.links,
    birth: person.birth,
    gender: person.gender,
    hasAvatar: person.avatarVersion !== null,
    photoCount: person.photoCount,
  };
}

/** Every person the current request may see, as documents, in the order of the people list. */
async function personDocuments(): Promise<PersonDocument[]> {
  const summaries = await listPeople();
  const rows = await shownPeople(summaries.map((person) => person.id));
  return summaries.map((summary) => {
    const row = rows.get(summary.id)?.row;
    let links: string[] = [];
    try {
      const parsed: unknown = row?.links ? JSON.parse(row.links) : [];
      if (Array.isArray(parsed)) links = parsed.filter((link): link is string => typeof link === 'string');
    } catch { /* unreadable links show as none */ }
    return {
      type: 'person',
      id: summary.id,
      name: summary.name,
      alias: summary.alias,
      comment: row?.comment ?? null,
      links,
      birth: row?.birth ?? null,
      gender: row?.gender ?? null,
      hasAvatar: summary.avatarVersion !== null,
      photoCount: summary.photoCount,
    };
  });
}

async function folderDocuments(): Promise<FolderDocument[]> {
  return (await listFolders()).map((folder) => ({
    type: 'folder', id: folder.id, path: folder.path, name: path.basename(folder.path), photoCount: folder.photoCount,
  }));
}

async function tagDocuments(): Promise<TagDocument[]> {
  return (await listTags()).map((tag) => ({ type: 'tag', id: tag.name, name: tag.name, photoCount: tag.photoCount }));
}

/** Every document of a type except photos, in list order. */
async function allOf(type: Exclude<ObjectType, 'photo'>): Promise<ObjectDocument[]> {
  switch (type) {
    case 'album': return (await listAlbums()).map(albumDocument);
    case 'person': return personDocuments();
    case 'folder': return folderDocuments();
    case 'tag': return tagDocuments();
  }
}

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

/** Paging of a list request, or the name of the invalid field. */
export function parsePaging(query: { limit?: unknown; offset?: unknown }, max = MAX_LIMIT): { limit: number; offset: number } | { field: string } {
  const read = (value: unknown, fallback: number): number | null => {
    if (value === undefined || value === '') return fallback;
    const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  const limit = read(query.limit, Math.min(DEFAULT_LIMIT, max));
  if (limit === null || limit < 1 || limit > max) return { field: 'limit' };
  const offset = read(query.offset, 0);
  if (offset === null) return { field: 'offset' };
  return { limit, offset };
}

/** The number of photos matching a selection. */
export async function countPhotos(filters: PhotoFilterQuery): Promise<number> {
  return (await get(db.select({ n: count() }).from(photos).where(await photoFilters(filters))))?.n ?? 0;
}

/** A page of documents of a type; photos are selected with the `GET /api/photos` parameters. */
export async function listDocuments(
  type: ObjectType, filters: PhotoFilterQuery, paging: { limit: number; offset: number },
): Promise<ObjectList> {
  if (type === 'photo') {
    const rows = await listPhotos({ ...filters, lang: PLACE_LANG, limit: String(paging.limit), offset: String(paging.offset) });
    return { items: await photoDocuments(rows), total: await countPhotos(filters) };
  }
  const items = await allOf(type);
  return { items: items.slice(paging.offset, paging.offset + paging.limit), total: items.length };
}

/** One document; undefined when there is no such object or the current request may not see it. */
export async function getDocument(type: ObjectType, id: string): Promise<ObjectDocument | undefined> {
  switch (type) {
    case 'photo': {
      const photoId = /^\d+$/.test(id) ? Number(id) : NaN;
      return Number.isSafeInteger(photoId) ? (await photoDocumentsById([photoId]))[0] : undefined;
    }
    case 'album': {
      const album = await getAlbum(id);
      return album && albumDocument(album);
    }
    case 'person': {
      const result = await getPerson(id);
      return result.status === 200 ? personDocument(result.body) : undefined;
    }
    case 'folder':
      return (await folderDocuments()).find((folder) => String(folder.id) === id);
    case 'tag':
      return (await tagDocuments()).find((tag) => textKey(tag.name) === textKey(id));
  }
}

/** Documents of several objects of one type, and the ids that were not found. */
export async function getDocuments(type: ObjectType, ids: readonly (string | number)[]): Promise<{ items: ObjectDocument[]; notFound: (string | number)[] }> {
  if (type === 'photo') {
    const numeric = ids.map((id) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    const items = await photoDocumentsById(numeric);
    const found = new Set(items.map((item) => item.id));
    return { items, notFound: ids.filter((id) => !found.has(Number(id))) };
  }
  const items: ObjectDocument[] = [];
  const notFound: (string | number)[] = [];
  for (const id of ids) {
    const document = await getDocument(type, String(id));
    if (document) items.push(document);
    else notFound.push(id);
  }
  return { items, notFound };
}
