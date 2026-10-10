import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { containsText, noRows, textPrefix } from '../db/sqlite.js';
import { albumPhotos, geoPlaces, photoKeywords, photoPeople, photos } from '../db/schema.js';
import { textKey } from './libraryText.js';
import { shownAlbumTexts } from './albumApi.js';
import { shownPeople } from './people.js';

/** Library selection shared by the photo grid, the map and the places list (query string values). */
export interface PhotoFilterQuery {
  folderId?: unknown;
  starred?: unknown;
  album?: unknown;
  /** A tag, compared ignoring case */
  tag?: unknown;
  /** Search text: every word must occur in one of the photo's texts */
  query?: unknown;
  includeHidden?: unknown;
  /** `true`: only photos with a location; `false`: only photos without one */
  geotagged?: unknown;
  /** Comma-separated photo ids, e.g. for photos picked on the map */
  ids?: unknown;
  /** A contact id: only photos with a face of that person */
  person?: unknown;
  /** `YYYY-MM-DD`: only photos taken on or after that day */
  takenFrom?: unknown;
  /** `YYYY-MM-DD`: only photos taken on or before that day */
  takenTo?: unknown;
}

/** Whether a value is a real calendar date written as `YYYY-MM-DD`. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The name of the first date filter that is given but is not a `YYYY-MM-DD` date, if any. */
export function invalidDateFilter({ takenFrom, takenTo }: PhotoFilterQuery): 'takenFrom' | 'takenTo' | undefined {
  if (takenFrom !== undefined && !isIsoDate(takenFrom)) return 'takenFrom';
  if (takenTo !== undefined && !isIsoDate(takenTo)) return 'takenTo';
  return undefined;
}

/** A photo's day taken: the calendar date of its date taken as the library stores it. */
export const dayTaken = textPrefix(photos.dateTaken, 10);

/** The SQL condition for a library selection; undefined when it matches every photo. */
export async function photoFilters({
  folderId, starred, album, tag, query, includeHidden, geotagged, ids, person, takenFrom, takenTo,
}: PhotoFilterQuery): Promise<SQL | undefined> {
  const conditions: SQL[] = [];
  if (typeof ids === 'string') {
    const list = ids.split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
    conditions.push(list.length > 0 ? inArray(photos.id, list) : noRows);
  }
  if (folderId) conditions.push(eq(photos.folderId, Number(folderId)));
  if (starred === 'true') conditions.push(eq(photos.isStarred, true));
  if (album && typeof album === 'string') {
    conditions.push(inArray(photos.id, db.select({ id: albumPhotos.photoId }).from(albumPhotos).where(eq(albumPhotos.token, album))));
  }
  if (tag && typeof tag === 'string') {
    conditions.push(inArray(photos.id, db.select({ id: photoKeywords.photoId }).from(photoKeywords).where(eq(photoKeywords.key, textKey(tag)))));
  }
  if (person && typeof person === 'string') {
    conditions.push(inArray(photos.id, db.select({ id: photoPeople.photoId }).from(photoPeople).where(eq(photoPeople.contactId, person))));
  }
  // An invalid date matches nothing; GET /api/photos rejects it before
  if (takenFrom !== undefined) conditions.push(isIsoDate(takenFrom) ? sql`${dayTaken} >= ${takenFrom}` : noRows);
  if (takenTo !== undefined) conditions.push(isIsoDate(takenTo) ? sql`${dayTaken} <= ${takenTo}` : noRows);
  if (includeHidden !== 'true') conditions.push(eq(photos.isHidden, false));
  if (geotagged === 'true') conditions.push(isNotNull(photos.latitude));
  if (geotagged === 'false') conditions.push(isNull(photos.latitude));
  if (query && typeof query === 'string') conditions.push(...await searchConditions(query));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** Keys of a map whose texts contain the word. */
function matching<T>(texts: Map<string, T>, word: string, textsOf: (value: T) => Array<string | null>): string[] {
  return [...texts].filter(([, value]) => textsOf(value).some((text) => text !== null && textKey(text).includes(word)))
    .map(([key]) => key);
}

/**
 * One condition per word of the search text, all of which must hold: the word occurs in the photo's own texts
 * (file name, folder path, description, tags, camera), its place name in any cached language, the shown name
 * or description of one of its albums, or the shown name or alias of a person on it. A substring match, so `%` and `_` are literal.
 */
async function searchConditions(query: string): Promise<SQL[]> {
  const words = textKey(query).split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return [];
  const albums = await shownAlbumTexts();
  const people = await shownPeople();
  return words.map((word) => {
    const placeCells = db.selectDistinct({ cell: geoPlaces.cell })
      .from(geoPlaces)
      .where(containsText(geoPlaces.searchText, word));
    const options: SQL[] = [
      containsText(photos.searchText, word),
      inArray(photos.geoCell, placeCells),
    ];
    const tokens = matching(albums, word, (album) => [album.name, album.description]);
    if (tokens.length > 0) {
      options.push(inArray(photos.id, db.select({ id: albumPhotos.photoId }).from(albumPhotos).where(inArray(albumPhotos.token, tokens))));
    }
    const contacts = matching(people, word, (person) => [person.name, person.alias]);
    if (contacts.length > 0) {
      options.push(inArray(photos.id, db.select({ id: photoPeople.photoId }).from(photoPeople).where(inArray(photoPeople.contactId, contacts))));
    }
    return or(...options)!;
  });
}
