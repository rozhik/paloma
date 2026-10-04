import { and, eq, inArray, isNotNull, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { albumPhotos, geoPlaces, photos } from '../db/schema.js';

/** Library selection shared by the photo grid, the map and the places list (query string values). */
export interface PhotoFilterQuery {
  folderId?: unknown;
  starred?: unknown;
  album?: unknown;
  query?: unknown;
  includeHidden?: unknown;
  /** `true`: only photos with a location; `false`: only photos without one */
  geotagged?: unknown;
  /** Comma-separated photo ids, e.g. for photos picked on the map */
  ids?: unknown;
}

/** The SQL condition for a library selection; undefined when it matches every photo. */
export function photoFilters({ folderId, starred, album, query, includeHidden, geotagged, ids }: PhotoFilterQuery): SQL | undefined {
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
  if (includeHidden !== 'true') conditions.push(eq(photos.isHidden, false));
  if (geotagged === 'true') conditions.push(isNotNull(photos.latitude));
  if (geotagged === 'false') conditions.push(isNull(photos.latitude));
  if (query && typeof query === 'string') {
    // Place names in any cached language; lowercased in JS because SQLite folds only ASCII
    const placeCells = db.selectDistinct({ cell: geoPlaces.cell })
      .from(geoPlaces)
      .where(sql`instr(${geoPlaces.searchText}, ${query.toLowerCase()}) > 0`);
    conditions.push(or(like(photos.filename, `%${query}%`), inArray(photos.geoCell, placeCells))!);
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}
