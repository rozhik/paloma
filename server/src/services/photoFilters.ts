import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { albumPhotos, geoPlaces, photoKeywords, photoPeople, photos } from '../db/schema.js';
import { textKey } from './libraryText.js';
import { shownAlbumTexts } from './albumApi.js';
import { personNames } from './people.js';

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
}

/** The SQL condition for a library selection; undefined when it matches every photo. */
export function photoFilters({ folderId, starred, album, tag, query, includeHidden, geotagged, ids }: PhotoFilterQuery): SQL | undefined {
  const conditions: SQL[] = [];
  if (typeof ids === 'string') {
    const list = ids.split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
    conditions.push(list.length > 0 ? inArray(photos.id, list) : sql`0`);
  }
  if (folderId) conditions.push(eq(photos.folderId, Number(folderId)));
  if (starred === 'true') conditions.push(eq(photos.isStarred, true));
  if (album && typeof album === 'string') {
    conditions.push(inArray(photos.id, db.select({ id: albumPhotos.photoId }).from(albumPhotos).where(eq(albumPhotos.token, album))));
  }
  if (tag && typeof tag === 'string') {
    conditions.push(inArray(photos.id, db.select({ id: photoKeywords.photoId }).from(photoKeywords).where(eq(photoKeywords.key, textKey(tag)))));
  }
  if (includeHidden !== 'true') conditions.push(eq(photos.isHidden, false));
  if (geotagged === 'true') conditions.push(isNotNull(photos.latitude));
  if (geotagged === 'false') conditions.push(isNull(photos.latitude));
  if (query && typeof query === 'string') conditions.push(...searchConditions(query));
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
 * or description of one of its albums, or the shown name of a person on it. `instr`, so `%` and `_` are literal.
 */
function searchConditions(query: string): SQL[] {
  const words = textKey(query).split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return [];
  const albums = shownAlbumTexts();
  const people = personNames();
  return words.map((word) => {
    const placeCells = db.selectDistinct({ cell: geoPlaces.cell })
      .from(geoPlaces)
      .where(sql`instr(${geoPlaces.searchText}, ${word}) > 0`);
    const options: SQL[] = [
      sql`instr(${photos.searchText}, ${word}) > 0`,
      inArray(photos.geoCell, placeCells),
    ];
    const tokens = matching(albums, word, (album) => [album.name, album.description]);
    if (tokens.length > 0) {
      options.push(inArray(photos.id, db.select({ id: albumPhotos.photoId }).from(albumPhotos).where(inArray(albumPhotos.token, tokens))));
    }
    const contacts = matching(people, word, (name) => [name]);
    if (contacts.length > 0) {
      options.push(inArray(photos.id, db.select({ id: photoPeople.photoId }).from(photoPeople).where(inArray(photoPeople.contactId, contacts))));
    }
    return or(...options)!;
  });
}
