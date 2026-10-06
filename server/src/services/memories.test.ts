import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let memories: typeof import('./memories.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_memories_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  memories = await import('./memories.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let folderId: number;
let serial = 0;

beforeEach(() => {
  for (const table of [schema.albumPhotos, schema.folderAlbums, schema.photos, schema.folders]) db.delete(table).run();
  folderId = db.insert(schema.folders).values({ path: path.join(tmpDir, 'photos'), name: 'photos', indexedAt: '' })
    .returning({ id: schema.folders.id }).get().id;
});

/** Adds a photo taken at noon UTC of each day and returns their ids. */
function addPhotos(days: string[], fields: { isHidden?: boolean; isStarred?: boolean } = {}): number[] {
  return days.map((day) => {
    const filename = `${++serial}.jpg`;
    return db.insert(schema.photos)
      .values({ folderId, filename, fileHash: filename, createdAt: '', dateTaken: `${day}T12:00:00.000Z`, ...fields })
      .returning({ id: schema.photos.id }).get().id;
  });
}

function addAlbum(token: string, name: string | null, photoIds: number[]) {
  db.insert(schema.folderAlbums).values({ folderId, token, name }).run();
  if (photoIds.length > 0) db.insert(schema.albumPhotos).values(photoIds.map((photoId) => ({ photoId, token }))).run();
}

const years = (date: string) => memories.memoriesOf(date).map((m) => m.year);

describe('memoryWindow', () => {
  it('spans three days on each side of the anniversary', () => {
    expect(memories.memoryWindow('2026-10-06', 2016)).toEqual({ year: 2016, from: '2016-10-03', to: '2016-10-09' });
  });

  it('crosses New Year', () => {
    expect(memories.memoryWindow('2026-01-01', 2016)).toEqual({ year: 2016, from: '2015-12-29', to: '2016-01-04' });
  });

  it('counts February 29 as February 28 in a year without it', () => {
    expect(memories.memoryWindow('2028-02-29', 2027)).toEqual({ year: 2027, from: '2027-02-25', to: '2027-03-03' });
    expect(memories.memoryWindow('2028-02-29', 2024)).toEqual({ year: 2024, from: '2024-02-26', to: '2024-03-03' });
  });
});

describe('a memory is a past year around the date', () => {
  it('takes the photos within three days and leaves the rest out', () => {
    const inside = addPhotos(['2016-10-04', '2016-10-06', '2016-10-09']);
    addPhotos(['2016-10-10']);

    const [memory] = memories.memoriesOf('2026-10-06');
    expect(memory).toMatchObject({ year: 2016, yearsAgo: 10, from: '2016-10-03', to: '2016-10-09', photoCount: 3 });
    expect(inside).toContain(memory.coverPhotoId);
  });

  it('needs at least three photos', () => {
    addPhotos(['2019-10-03', '2019-10-09']);
    expect(years('2026-10-06')).toEqual([]);
  });

  it('does not count hidden photos', () => {
    addPhotos(['2020-10-06', '2020-10-06']);
    addPhotos(['2020-10-06'], { isHidden: true });
    expect(years('2026-10-06')).toEqual([]);
  });

  it('crosses New Year', () => {
    addPhotos(['2015-12-30', '2016-01-01', '2016-01-03']);
    expect(memories.memoriesOf('2026-01-01')).toMatchObject([{ year: 2016, photoCount: 3 }]);
  });

  it('treats a leap day as February 28 in other years', () => {
    addPhotos(['2027-02-27', '2027-02-27', '2027-02-27']);
    expect(years('2028-02-29')).toEqual([2027]);
  });

  it('has no memory for the date\'s own year', () => {
    addPhotos(['2026-10-04', '2026-10-04', '2026-10-04', '2026-10-04', '2026-10-04']);
    expect(years('2026-10-06')).toEqual([]);
  });

  it('is empty for an empty library', () => {
    expect(memories.memoriesOf('2026-10-06')).toEqual([]);
  });
});

describe('naming album and cover', () => {
  it('names a memory after the album that holds all its photos', () => {
    const ids = addPhotos(['1991-10-05', '1991-10-06', '1991-10-06', '1991-10-07', '1991-10-08']);
    addAlbum('c9ea', 'Kyiv', ids);
    expect(memories.memoriesOf('2026-10-06')[0].album).toEqual({ token: 'c9ea', name: 'Kyiv' });
  });

  it('has no album when some photos are outside it', () => {
    const ids = addPhotos(['2016-10-05', '2016-10-06', '2016-10-07', '2016-10-08', '2016-10-08']);
    addAlbum('c9ea', 'Kyiv', ids.slice(0, 3));
    expect(memories.memoriesOf('2026-10-06')[0].album).toBeNull();
  });

  it('chooses the album with the fewest photos, then the first by name', () => {
    const ids = addPhotos(['2016-10-05', '2016-10-06', '2016-10-07']);
    const others = addPhotos(['2001-01-01', '2001-01-02']);
    addAlbum('aaaa', 'Trips', [...ids, ...others]);
    addAlbum('bbbb', 'kyiv', ids);
    addAlbum('cccc', 'Lviv', ids);
    expect(memories.memoriesOf('2026-10-06')[0].album).toEqual({ token: 'bbbb', name: 'kyiv' });
  });

  it('ignores albums without a name', () => {
    const ids = addPhotos(['2016-10-05', '2016-10-06', '2016-10-07']);
    addAlbum('c9ea', null, ids);
    addAlbum('7f01', '  ', ids);
    expect(memories.memoriesOf('2026-10-06')[0].album).toBeNull();
  });

  it('lists newest first and covers with the first starred photo, else the first photo', () => {
    addPhotos(['2016-10-05', '2016-10-06', '2016-10-07']);
    const [, starred] = addPhotos(['2023-10-05', '2023-10-06'], { isStarred: true });
    addPhotos(['2023-10-08']);
    const old = addPhotos(['1991-10-05', '1991-10-06', '1991-10-07']);

    const list = memories.memoriesOf('2026-10-06');
    expect(list.map((m) => m.year)).toEqual([2023, 2016, 1991]);
    // Photo-list order is newest first: 2023-10-06 is the first starred one
    expect(list[0].coverPhotoId).toBe(starred);
    expect(list[0].coverThumbnailUrl).toMatch(/^\/api\//);
    expect(list[2].coverPhotoId).toBe(old[2]);
  });
});

describe('listMemories', () => {
  it.each([undefined, '', '2026-13-40', '2026-02-30', ['2026-10-06']])('rejects date %j with 400', (date) => {
    expect(memories.listMemories(date)).toMatchObject({ status: 400, body: { code: 'invalid_date', params: { field: 'date' } } });
  });

  it('lists the memories of a valid date', () => {
    addPhotos(['2016-10-05', '2016-10-06', '2016-10-07']);
    expect(memories.listMemories('2026-10-06')).toMatchObject({ status: 200, body: [{ year: 2016, title: null }] });
  });
});
