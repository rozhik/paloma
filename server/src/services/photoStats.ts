import { count, eq, inArray, max, min, sql, sum } from 'drizzle-orm';
import { db } from '../db/index.js';
import { all, get } from '../db/query.js';
import { albumPhotos, edits, folders, photoPeople, photos } from '../db/schema.js';
import { photoFilters, type PhotoFilterQuery } from './photoFilters.js';
import { shownAlbumTexts } from './albumApi.js';
import { shownPeople } from './people.js';
import type { PhotoStats } from '../../../shared/types.js';

/** Most photos first, then by name; unnamed entries after named ones. */
function byCountThenName<T extends { name: string | null; photoCount: number }>(a: T, b: T): number {
  if (a.photoCount !== b.photoCount) return b.photoCount - a.photoCount;
  if (a.name === null || b.name === null) return a.name === b.name ? 0 : a.name === null ? 1 : -1;
  return a.name.localeCompare(b.name);
}

/**
 * Totals over every photo of a library selection (the same parameters as `GET /api/photos`, without paging):
 * counts, size, date range, and the folders, albums and people the photos belong to. Reads only the library.
 */
export async function photoStats(filters: PhotoFilterQuery): Promise<PhotoStats> {
  const where = await photoFilters(filters);
  // The matching photos, for the joins below
  const matching = db.select({ id: photos.id }).from(photos).where(where);

  const totals = await get(db.select({
    photoCount: count(),
    totalSize: sum(photos.fileSize),
    takenFrom: min(photos.dateTaken),
    takenTo: max(photos.dateTaken),
    undatedCount: sql<number>`coalesce(sum(case when ${photos.dateTaken} is null then 1 else 0 end), 0)`,
    starredCount: sql<number>`coalesce(sum(case when ${photos.isStarred} then 1 else 0 end), 0)`,
    geotaggedCount: sql<number>`coalesce(sum(case when ${photos.latitude} is not null then 1 else 0 end), 0)`,
  }).from(photos).where(where));

  // A photo without edits has no row; an empty chain is never stored, but is not counted either way
  const modified = await get(db.select({ n: count() }).from(edits)
    .where(sql`${inArray(edits.photoId, matching)} and ${edits.editInstructionsJson} <> '[]'`));

  const folderRows = await all(db.select({ id: folders.id, name: folders.name, path: folders.path, photoCount: count() })
    .from(photos)
    .innerJoin(folders, eq(photos.folderId, folders.id))
    .where(where)
    .groupBy(folders.id));

  const albumRows = await all(db.select({ token: albumPhotos.token, photoCount: count() })
    .from(albumPhotos)
    .where(inArray(albumPhotos.photoId, matching))
    .groupBy(albumPhotos.token));
  const albumTexts = albumRows.length > 0 ? await shownAlbumTexts() : new Map();

  const personRows = await all(db.select({ id: photoPeople.contactId, photoCount: count() })
    .from(photoPeople)
    .where(inArray(photoPeople.photoId, matching))
    .groupBy(photoPeople.contactId));
  const people = personRows.length > 0 ? await shownPeople(personRows.map((row) => row.id)) : new Map();

  return {
    photoCount: totals?.photoCount ?? 0,
    totalSize: Number(totals?.totalSize ?? 0),
    takenFrom: totals?.takenFrom ?? null,
    takenTo: totals?.takenTo ?? null,
    undatedCount: Number(totals?.undatedCount ?? 0),
    starredCount: Number(totals?.starredCount ?? 0),
    geotaggedCount: Number(totals?.geotaggedCount ?? 0),
    modifiedCount: modified?.n ?? 0,
    folders: folderRows.sort(byCountThenName),
    albums: albumRows.map(({ token, photoCount }) => ({ token, name: albumTexts.get(token)?.name ?? null, photoCount })).sort(byCountThenName),
    people: personRows.map(({ id, photoCount }) => ({ id, name: people.get(id)?.name ?? null, photoCount })).sort(byCountThenName),
  };
}
