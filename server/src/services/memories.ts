import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { albumPhotos, edits, photos } from '../db/schema.js';
import { apiError } from './apiError.js';
import { listAlbums } from './albumApi.js';
import { libraryImageUrls } from './libraryImages.js';
import { dayTaken, isIsoDate } from './photoFilters.js';
import type { ApiResult } from './photoApi.js';
import type { Memory } from '../../../shared/types.js';

/** Days before and after the anniversary that still belong to a memory. */
export const MEMORY_WINDOW_DAYS = 3;
/** Photos a year needs around the date to become a memory. */
export const MEMORY_MIN_PHOTOS = 3;

export interface MemoryWindow {
  year: number;
  /** First and last day, `YYYY-MM-DD` */
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/** The window of `year` around the month and day of `date` (`YYYY-MM-DD`); February 29 counts as February 28 in other years. */
export function memoryWindow(date: string, year: number): MemoryWindow {
  const [, month, day] = date.split('-').map(Number);
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
  const anniversary = Date.UTC(year, month - 1, month === 2 && day === 29 && !leap ? 28 : day);
  return {
    year,
    from: isoDay(anniversary - MEMORY_WINDOW_DAYS * DAY_MS),
    to: isoDay(anniversary + MEMORY_WINDOW_DAYS * DAY_MS),
  };
}

interface MemoryPhoto {
  id: number;
  day: string;
  isStarred: boolean;
  fileHash: string;
  editsJson: string | null;
}

/** Among named albums holding every one of the photos, the one with the fewest photos, ties by name ignoring case. */
function namingAlbum(photoIds: number[]): Memory['album'] {
  const tokens = db.select({ token: albumPhotos.token })
    .from(albumPhotos)
    .where(inArray(albumPhotos.photoId, photoIds))
    .groupBy(albumPhotos.token)
    .having(sql`count(distinct ${albumPhotos.photoId}) = ${photoIds.length}`)
    .all()
    .map((row) => row.token);
  if (tokens.length === 0) return null;
  const [album] = listAlbums(tokens)
    .filter((a): a is typeof a & { name: string } => a.name !== null && a.name.trim() !== '')
    .sort((a, b) => a.photoCount - b.photoCount || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return album ? { token: album.token, name: album.name } : null;
}

/** The memories of a date: one per earlier year with enough photos that are not hidden around it, newest first. */
export function memoriesOf(date: string): Memory[] {
  const thisYear = Number(date.slice(0, 4));
  const oldest = db.select({ year: sql<string | null>`min(substr(${photos.dateTaken}, 1, 4))` })
    .from(photos)
    .where(eq(photos.isHidden, false))
    .get()?.year;
  if (!oldest) return [];
  const windows: MemoryWindow[] = [];
  // A window can start in the year before its own, so the oldest photo's year is enough
  for (let year = thisYear - 1; year >= Number(oldest); year--) windows.push(memoryWindow(date, year));
  if (windows.length === 0) return [];

  const rows: MemoryPhoto[] = db.select({
    id: photos.id,
    day: dayTaken,
    isStarred: photos.isStarred,
    fileHash: photos.fileHash,
    editsJson: edits.editInstructionsJson,
  })
    .from(photos)
    .leftJoin(edits, eq(photos.id, edits.photoId))
    .where(and(eq(photos.isHidden, false), or(...windows.map((w) => sql`${dayTaken} between ${w.from} and ${w.to}`))))
    .orderBy(desc(photos.dateTaken), photos.id)
    .all();

  return windows.flatMap((window): Memory[] => {
    // Windows of different years never overlap, so each photo is in one memory
    const members = rows.filter((row) => row.day >= window.from && row.day <= window.to);
    if (members.length < MEMORY_MIN_PHOTOS) return [];
    const cover = members.find((row) => row.isStarred) ?? members[0];
    return [{
      ...window,
      yearsAgo: thisYear - window.year,
      photoCount: members.length,
      album: namingAlbum(members.map((row) => row.id)),
      title: null,
      coverPhotoId: cover.id,
      coverThumbnailUrl: libraryImageUrls(cover, cover.editsJson).thumbnailUrl,
    }];
  });
}

/** `GET /api/memories?date=YYYY-MM-DD`: the memories of the client's local date. */
export function listMemories(date: unknown): ApiResult<Memory[]> {
  if (!isIsoDate(date)) {
    return { status: 400, body: apiError('invalid_date', 'date must be a YYYY-MM-DD date', { field: 'date' }) };
  }
  return { status: 200, body: memoriesOf(date) };
}
