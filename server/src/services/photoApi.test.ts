import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { eq } from 'drizzle-orm';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let dir: string;
let api: typeof import('./photoApi.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
let invalidDateFilter: typeof import('./photoFilters.js').invalidDateFilter;

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_api_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  api = await import('./photoApi.js');
  await (await import('../plugins/index.js')).pluginRegistry.init();
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  ({ invalidDateFilter } = await import('./photoFilters.js'));
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let folderId: number;
const ids: Record<string, number> = {};

beforeEach(() => {
  for (const table of [schema.edits, schema.albumPhotos, schema.folderAlbums, schema.photos, schema.folders]) db.delete(table).run();
  dir = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
  folderId = db.insert(schema.folders)
    .values({ path: dir, name: path.basename(dir), indexedAt: '' })
    .returning({ id: schema.folders.id }).get().id;
  for (const filename of ['a.jpg', 'b.jpg', 'c.jpg']) {
    fs.writeFileSync(path.join(dir, filename), '');
    ids[filename] = db.insert(schema.photos)
      .values({ folderId, filename, fileHash: filename, createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
  }
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.chmodSync(dir, 0o755);
});

const row = (filename: string) =>
  db.select().from(schema.photos).where(eq(schema.photos.id, ids[filename])).get()!;
const sidecar = () => JSON.parse(fs.readFileSync(path.join(dir, '.paloma.json'), 'utf-8'));

describe('updatePhoto', () => {
  it('sets caption and keywords in the sidecar and the library and returns the photo', () => {
    const result = api.updatePhoto(ids['a.jpg'], { caption: 'Sunrise', keywords: ['dawn', '', 'dawn', 'hills'] });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: ids['a.jpg'], caption: 'Sunrise', keywords: ['dawn', 'hills'], isHidden: false });
    expect(sidecar().photos['a.jpg']).toMatchObject({ caption: 'Sunrise', keywords: ['dawn', 'hills'] });
    expect(row('a.jpg')).toMatchObject({ caption: 'Sunrise', keywords: '["dawn","hills"]' });
  });

  it('clears a caption with an empty string', () => {
    api.updatePhoto(ids['a.jpg'], { caption: 'Sunrise', isStarred: true });
    const result = api.updatePhoto(ids['a.jpg'], { caption: '' });

    expect(result.body).toMatchObject({ caption: null, isStarred: true });
    expect(sidecar().photos['a.jpg']).not.toHaveProperty('caption');
  });

  it.each([
    [{ isHidden: 'yes' }, 'invalid_field', { field: 'isHidden' }],
    [{ isStarred: 1 }, 'invalid_field', { field: 'isStarred' }],
    [{ caption: 5 }, 'invalid_field', { field: 'caption' }],
    [{ keywords: 'a,b' }, 'invalid_field', { field: 'keywords' }],
    [{ keywords: ['a', 1] }, 'invalid_field', { field: 'keywords' }],
    [{}, 'no_photo_fields', undefined],
    [{ other: true }, 'no_photo_fields', undefined],
    [null, 'invalid_body', undefined],
    [{ location: { lat: '49.8', lon: 24 } }, 'invalid_location', undefined],
    [{ location: { lat: 91, lon: 0 } }, 'invalid_location', undefined],
    [{ location: [49.8, 24] }, 'invalid_location', undefined],
    [{ location: 'Lviv' }, 'invalid_location', undefined],
  ])('rejects %j with 400 and code %s and changes nothing', (body, code, params) => {
    const result = api.updatePhoto(ids['a.jpg'], body);
    expect(result).toEqual({ status: 400, body: { error: expect.any(String), code, ...(params && { params }) } });
    expect(fs.existsSync(path.join(dir, '.paloma.json'))).toBe(false);
    expect(row('a.jpg').isHidden).toBe(false);
  });

  it('responds 404 for an unknown photo', () => {
    expect(api.updatePhoto(999999, { isStarred: true }))
      .toEqual({ status: 404, body: { error: 'Photo not found', code: 'photo_not_found' } });
  });

  it('responds 409 for an unreadable sidecar and leaves the file and the library unchanged', () => {
    fs.writeFileSync(path.join(dir, '.paloma.json'), '{broken');
    const result = api.updatePhoto(ids['a.jpg'], { isStarred: true });

    expect(result).toMatchObject({
      status: 409, body: { code: 'sidecar_unreadable', params: { files: path.join(dir, '.paloma.json') } },
    });
    expect(fs.readFileSync(path.join(dir, '.paloma.json'), 'utf-8')).toBe('{broken');
    expect(row('a.jpg').isStarred).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(dir), expect.anything());
  });

  it.skipIf(process.getuid?.() === 0)('responds 500 in a read-only folder and leaves the library unchanged', () => {
    fs.chmodSync(dir, 0o555);
    const result = api.updatePhoto(ids['a.jpg'], { caption: 'x' });

    expect(result).toMatchObject({ status: 500, body: { code: 'sidecar_write_failed', params: { folders: dir } } });
    expect(row('a.jpg').caption).toBeNull();
  });

  it('applies a re-imported Picasa .ini to the other photos of the folder', () => {
    fs.writeFileSync(path.join(dir, '.picasa.ini'), '[b.jpg]\r\nstar=yes\r\n');
    api.updatePhoto(ids['a.jpg'], { isStarred: true });

    expect(row('a.jpg').isStarred).toBe(true);
    expect(row('b.jpg').isStarred).toBe(true);
  });
});

describe('updatePhoto location', () => {
  const setExif = (filename: string): void => {
    db.update(schema.photos).set({ exifLatitude: 48.1, exifLongitude: 24.5, latitude: 48.1, longitude: 24.5, locationSource: 'exif' })
      .where(eq(schema.photos.id, ids[filename])).run();
  };

  it('sets a location in the sidecar and the library', () => {
    const result = api.updatePhoto(ids['a.jpg'], { location: { lat: 49.8397, lon: 24.0297 } });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ latitude: 49.8397, longitude: 24.0297, locationSource: 'user' });
    expect(sidecar().photos['a.jpg']).toEqual({ geotag: { lat: 49.8397, lon: 24.0297 }, modified: expect.any(String) });
    expect(row('a.jpg').geoCell).toBe('4984:2403');
  });

  it('clears a camera location by storing null', () => {
    setExif('a.jpg');
    const result = api.updatePhoto(ids['a.jpg'], { location: null });

    expect(result.body).toMatchObject({ latitude: null, longitude: null, locationSource: null });
    expect(sidecar().photos['a.jpg']).toEqual({ geotag: null, modified: expect.any(String) });
  });

  it('clears a location set in Paloma by removing the key', () => {
    api.updatePhoto(ids['a.jpg'], { location: { lat: 1, lon: 2 }, isStarred: true });
    const result = api.updatePhoto(ids['a.jpg'], { location: null });

    expect(result.body).toMatchObject({ latitude: null, locationSource: null, isStarred: true });
    expect(sidecar().photos['a.jpg']).not.toHaveProperty('geotag');
  });

  it('clears a Paloma location over a camera location by storing null, so the camera one stays hidden', () => {
    setExif('a.jpg');
    api.updatePhoto(ids['a.jpg'], { location: { lat: 1, lon: 2 } });
    const result = api.updatePhoto(ids['a.jpg'], { location: null });

    expect(result.body).toMatchObject({ latitude: null, locationSource: null });
    expect(sidecar().photos['a.jpg'].geotag).toBeNull();
  });

  it('saves caption and location in one write', () => {
    const result = api.updatePhoto(ids['a.jpg'], { caption: 'Market', location: { lat: 49.8397, lon: 24.0297 } });

    expect(result.body).toMatchObject({ caption: 'Market', latitude: 49.8397 });
    expect(sidecar().photos['a.jpg']).toMatchObject({ caption: 'Market', geotag: { lat: 49.8397, lon: 24.0297 } });
  });
});

describe('setPhotosLocation', () => {
  let dirB: string;
  let idB: number;

  beforeEach(() => {
    dirB = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
    const folderB = db.insert(schema.folders).values({ path: dirB, name: path.basename(dirB), indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
    fs.writeFileSync(path.join(dirB, '2.jpg'), '');
    idB = db.insert(schema.photos).values({ folderId: folderB, filename: '2.jpg', fileHash: '2', createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
  });

  afterEach(() => {
    fs.chmodSync(dirB, 0o755);
  });

  const sidecarB = () => JSON.parse(fs.readFileSync(path.join(dirB, '.paloma.json'), 'utf-8'));

  it('sets the location of photos in two folders and returns them', () => {
    const result = api.setPhotosLocation({ photoIds: [ids['a.jpg'], ids['b.jpg'], idB], location: { lat: 46.48, lon: 30.72 } });

    expect(result.status).toBe(200);
    expect((result.body as Array<{ id: number; latitude: number }>).map((p) => [p.id, p.latitude]))
      .toEqual([[ids['a.jpg'], 46.48], [ids['b.jpg'], 46.48], [idB, 46.48]]);
    expect(sidecar().photos['a.jpg'].geotag).toEqual({ lat: 46.48, lon: 30.72 });
    expect(sidecar().photos['b.jpg'].modified).toBe(sidecar().photos['a.jpg'].modified);
    expect(sidecarB().photos['2.jpg'].geotag).toEqual({ lat: 46.48, lon: 30.72 });
    expect(row('a.jpg')).toMatchObject({ latitude: 46.48, locationSource: 'user' });
  });

  it('clears locations, storing null only over a camera location', () => {
    db.update(schema.photos).set({ exifLatitude: 1, exifLongitude: 2 }).where(eq(schema.photos.id, ids['a.jpg'])).run();
    api.setPhotosLocation({ photoIds: [ids['a.jpg'], ids['b.jpg']], location: { lat: 5, lon: 6 } });

    const result = api.setPhotosLocation({ photoIds: [ids['a.jpg'], ids['b.jpg']], location: null });

    expect(result.status).toBe(200);
    expect(sidecar().photos['a.jpg'].geotag).toBeNull();
    expect(sidecar().photos).not.toHaveProperty('b.jpg');
    expect(row('b.jpg').latitude).toBeNull();
  });

  it.each([
    [{ location: { lat: 1, lon: 2 } }, 'photo_ids_required'],
    [{ photoIds: [], location: { lat: 1, lon: 2 } }, 'photo_ids_required'],
    [{ photoIds: [1] }, 'invalid_location'],
    [{ photoIds: [1], location: { lat: 100, lon: 2 } }, 'invalid_location'],
  ])('rejects %j with 400 and %s', (body, code) => {
    expect(api.setPhotosLocation(body)).toMatchObject({ status: 400, body: { code } });
  });

  it('responds 404 when a photo is not in the library and changes nothing', () => {
    expect(api.setPhotosLocation({ photoIds: [ids['a.jpg'], 999999], location: { lat: 1, lon: 2 } }))
      .toMatchObject({ status: 404, body: { code: 'photo_not_found' } });
    expect(fs.existsSync(path.join(dir, '.paloma.json'))).toBe(false);
  });

  it('responds 409 for a corrupt sidecar and writes nothing', () => {
    fs.writeFileSync(path.join(dirB, '.paloma.json'), '{ not json');

    const result = api.setPhotosLocation({ photoIds: [ids['a.jpg'], idB], location: { lat: 1, lon: 2 } });

    expect(result).toMatchObject({ status: 409, body: { code: 'sidecar_unreadable', failedFolders: [dirB] } });
    expect(fs.existsSync(path.join(dir, '.paloma.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dirB, '.paloma.json'), 'utf-8')).toBe('{ not json');
    expect(row('a.jpg').latitude).toBeNull();
  });

  it('keeps folders already written when another folder is read-only, and names it', () => {
    fs.chmodSync(dirB, 0o555);

    const result = api.setPhotosLocation({ photoIds: [ids['a.jpg'], idB], location: { lat: 1, lon: 2 } });

    expect(result).toMatchObject({ status: 500, body: { code: 'sidecar_write_failed', failedFolders: [dirB] } });
    expect(row('a.jpg').latitude).toBe(1);
    expect(db.select().from(schema.photos).where(eq(schema.photos.id, idB)).get()!.latitude).toBeNull();
  });
});

describe('photo edits and image URLs', () => {
  const setEdits = (filename: string, json: string) =>
    db.insert(schema.edits).values({ photoId: ids[filename], editInstructionsJson: json, updatedAt: '' }).run();

  it('returns the edit chain and rendered image URLs for a photo with effective edits', () => {
    setEdits('a.jpg', '[{"filter":"bw"}]');
    const a = api.listPhotos({}).find((p) => p.filename === 'a.jpg')!;
    expect(a.edits).toEqual([{ filter: 'bw' }]);
    expect(a.thumbnailUrl).toMatch(new RegExp(`^/api/photos/${ids['a.jpg']}/thumbnail\\?r=[0-9a-f]{12}$`));
    expect(a.previewUrl).toMatch(new RegExp(`^/api/photos/${ids['a.jpg']}/preview\\?r=[0-9a-f]{12}$`));
  });

  it('keeps the scanner image URLs without edits or when no plugin renders them', () => {
    setEdits('b.jpg', '[{"filter":"grain"}]');
    const photos = api.listPhotos({});
    expect(photos.find((p) => p.filename === 'b.jpg')).toMatchObject({
      edits: [{ filter: 'grain' }], thumbnailUrl: '/api/cache/thumbnail/b.jpg', previewUrl: '/api/cache/preview/b.jpg',
    });
    expect(photos.find((p) => p.filename === 'c.jpg')).toMatchObject({ edits: null, thumbnailUrl: '/api/cache/thumbnail/c.jpg' });
  });
});

describe('listPhotos and listFolders', () => {
  it('leaves hidden photos out unless includeHidden=true, and does not count them', () => {
    api.updatePhoto(ids['b.jpg'], { isHidden: true });

    expect(api.listPhotos({ folderId: String(folderId) }).map((p) => p.filename).sort()).toEqual(['a.jpg', 'c.jpg']);
    expect(api.listPhotos({ folderId: String(folderId), includeHidden: 'true' })).toHaveLength(3);
    expect(api.listFolders().find((f) => f.id === folderId)?.photoCount).toBe(2);
  });

  it('filters by having a location and returns the location fields', () => {
    api.updatePhoto(ids['a.jpg'], { location: { lat: 49.8397, lon: 24.0297 } });

    expect(api.listPhotos({ geotagged: 'true' }).map((p) => p.filename)).toEqual(['a.jpg']);
    expect(api.listPhotos({ geotagged: 'false' }).map((p) => p.filename).sort()).toEqual(['b.jpg', 'c.jpg']);
    const [a] = api.listPhotos({ geotagged: 'true' });
    expect(a).toMatchObject({ latitude: 49.8397, longitude: 24.0297, locationSource: 'user' });
    expect(a).not.toHaveProperty('exifLatitude');
    expect(a).not.toHaveProperty('geoCell');
    expect(api.listPhotos({ geotagged: 'false' })[0]).toMatchObject({ latitude: null, longitude: null, locationSource: null });
  });

  it('returns caption, keywords and isHidden', () => {
    api.updatePhoto(ids['a.jpg'], { caption: 'Sunrise', keywords: ['dawn'] });
    const photos = api.listPhotos({});

    expect(photos.find((p) => p.filename === 'a.jpg')).toMatchObject({ caption: 'Sunrise', keywords: ['dawn'], isHidden: false });
    expect(photos.find((p) => p.filename === 'c.jpg')).toMatchObject({ caption: null, keywords: [], isHidden: false });
  });

  it('lists the photos of an album across folders, with their album tokens', () => {
    const other = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
    const otherId = db.insert(schema.folders).values({ path: other, name: 'other', indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
    const d = db.insert(schema.photos).values({ folderId: otherId, filename: 'd.jpg', fileHash: 'd', createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
    db.insert(schema.albumPhotos).values([
      { photoId: ids['a.jpg'], token: 'c9ea' },
      { photoId: ids['b.jpg'], token: 'c9ea' },
      { photoId: ids['b.jpg'], token: '7f01' },
      { photoId: d, token: 'c9ea' },
    ]).run();
    db.update(schema.photos).set({ isHidden: true }).where(eq(schema.photos.id, ids['b.jpg'])).run();

    const inAlbum = api.listPhotos({ album: 'c9ea' });
    expect(inAlbum.map((p) => p.filename).sort()).toEqual(['a.jpg', 'd.jpg']);
    expect(inAlbum.every((p) => p.albums.includes('c9ea'))).toBe(true);
    expect(api.listPhotos({ album: 'c9ea', includeHidden: 'true' }).find((p) => p.filename === 'b.jpg')?.albums.sort())
      .toEqual(['7f01', 'c9ea']);
    expect(api.listPhotos({}).find((p) => p.filename === 'c.jpg')?.albums).toEqual([]);
  });
});

describe('photos taken in a date range', () => {
  const take = (filename: string, dateTaken: string) =>
    db.update(schema.photos).set({ dateTaken }).where(eq(schema.photos.id, ids[filename])).run();

  beforeEach(() => {
    take('a.jpg', '2016-10-02T23:59:59.000Z');
    take('b.jpg', '2016-10-03T00:00:00.000Z');
    take('c.jpg', '2016-10-09T23:59:59.000Z');
  });

  it('returns the photos whose day taken lies in the inclusive range, newest first', () => {
    expect(api.listPhotos({ takenFrom: '2016-10-03', takenTo: '2016-10-09' }).map((p) => p.filename)).toEqual(['c.jpg', 'b.jpg']);
    expect(api.listPhotos({ takenFrom: '2016-10-03' }).map((p) => p.filename)).toEqual(['c.jpg', 'b.jpg']);
    expect(api.listPhotos({ takenTo: '2016-10-02' }).map((p) => p.filename)).toEqual(['a.jpg']);
  });

  it('combines with the album, search and hidden-photo filters', () => {
    db.insert(schema.albumPhotos).values([{ photoId: ids['b.jpg'], token: 'c9ea' }, { photoId: ids['c.jpg'], token: 'c9ea' }]).run();
    const range = { takenFrom: '2016-10-01', takenTo: '2016-10-09' };

    expect(api.listPhotos({ ...range, album: 'c9ea' }).map((p) => p.filename)).toEqual(['c.jpg', 'b.jpg']);
    expect(api.listPhotos({ ...range, query: 'a.jpg' }).map((p) => p.filename)).toEqual([]);
    api.updatePhoto(ids['c.jpg'], { caption: 'bridge', isHidden: true });
    expect(api.listPhotos({ ...range, query: 'bridge' })).toEqual([]);
    expect(api.listPhotos({ ...range, query: 'bridge', includeHidden: 'true' }).map((p) => p.filename)).toEqual(['c.jpg']);
  });

  it.each([
    [{ takenFrom: '2016-13-40' }, 'takenFrom'],
    [{ takenFrom: '2016-02-30' }, 'takenFrom'],
    [{ takenTo: '16-10-09' }, 'takenTo'],
    [{ takenFrom: '2016-10-03', takenTo: ['2016-10-09'] }, 'takenTo'],
  ])('names an invalid date %j', (query, field) => {
    expect(invalidDateFilter(query)).toBe(field);
    expect(api.listPhotos(query)).toEqual([]);
  });

  it('accepts valid dates and no dates', () => {
    expect(invalidDateFilter({ takenFrom: '2016-02-29', takenTo: '2016-10-09' })).toBeUndefined();
    expect(invalidDateFilter({})).toBeUndefined();
  });
});

describe('embedded text', () => {
  const embed = (filename: string, values: { embeddedCaption?: string; embeddedKeywords?: string[] }) =>
    db.update(schema.photos).set({
      embeddedCaption: values.embeddedCaption ?? null,
      embeddedKeywords: values.embeddedKeywords ? JSON.stringify(values.embeddedKeywords) : null,
    }).where(eq(schema.photos.id, ids[filename])).run();

  it('clears an embedded caption by storing "" and leaves the photo file alone', () => {
    embed('a.jpg', { embeddedCaption: 'Market day' });
    const file = path.join(dir, 'a.jpg');
    const before = fs.statSync(file).mtimeMs;

    const result = api.updatePhoto(ids['a.jpg'], { caption: '' });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ caption: null });
    expect(sidecar().photos['a.jpg']).toMatchObject({ caption: '' });
    expect(fs.statSync(file).mtimeMs).toBe(before);
    expect(fs.readFileSync(file, 'utf-8')).toBe('');
  });

  it('removes the last embedded tag by storing []', () => {
    embed('a.jpg', { embeddedKeywords: ['old'] });
    const result = api.updatePhoto(ids['a.jpg'], { keywords: [] });
    expect(result.body).toMatchObject({ keywords: [] });
    expect(sidecar().photos['a.jpg']).toMatchObject({ keywords: [] });
  });
});

describe('changePhotosKeywords', () => {
  let dirB: string;
  let idB: number;

  beforeEach(() => {
    dirB = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
    const folderB = db.insert(schema.folders).values({ path: dirB, name: path.basename(dirB), indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
    fs.writeFileSync(path.join(dirB, '2.jpg'), '');
    idB = db.insert(schema.photos).values({ folderId: folderB, filename: '2.jpg', fileHash: '2', createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
  });

  const sidecarB = () => JSON.parse(fs.readFileSync(path.join(dirB, '.paloma.json'), 'utf-8'));

  it('adds a tag in two folders, keeping embedded tags first', () => {
    db.update(schema.photos).set({ embeddedKeywords: '["old"]', keywords: '["old"]' }).where(eq(schema.photos.id, ids['a.jpg'])).run();

    const result = api.changePhotosKeywords({ photoIds: [ids['a.jpg'], idB], add: ['trip'] });

    expect(result.status).toBe(200);
    expect((result.body as Array<{ keywords: string[] }>).map((p) => p.keywords)).toEqual([['old', 'trip'], ['trip']]);
    expect(sidecar().photos['a.jpg'].keywords).toEqual(['old', 'trip']);
    expect(sidecarB().photos['2.jpg'].keywords).toEqual(['trip']);
  });

  it('leaves a photo that has the tag in another case unchanged', () => {
    api.updatePhoto(ids['a.jpg'], { keywords: ['Trip'] });
    const before = fs.readFileSync(path.join(dir, '.paloma.json'), 'utf-8');

    expect(api.changePhotosKeywords({ photoIds: [ids['a.jpg']], add: ['trip'] }).status).toBe(200);
    expect(fs.readFileSync(path.join(dir, '.paloma.json'), 'utf-8')).toBe(before);
  });

  it('removes a tag ignoring case, storing [] over embedded tags', () => {
    db.update(schema.photos).set({ embeddedKeywords: '["Birds"]', keywords: '["Birds"]' }).where(eq(schema.photos.id, ids['a.jpg'])).run();
    api.updatePhoto(ids['b.jpg'], { keywords: ['birds', 'sky'] });

    const result = api.changePhotosKeywords({ photoIds: [ids['a.jpg'], ids['b.jpg']], remove: ['BIRDS'] });

    expect(result.status).toBe(200);
    expect(sidecar().photos['a.jpg'].keywords).toEqual([]);
    expect(sidecar().photos['b.jpg'].keywords).toEqual(['sky']);
  });

  it.each([
    [{ photoIds: [1], add: [] }, 'no_photo_fields'],
    [{ photoIds: [], add: ['x'] }, 'photo_ids_required'],
    [{ photoIds: [1], add: 'x' }, 'invalid_field'],
  ])('rejects %j with 400', (body, code) => {
    const result = api.changePhotosKeywords(body);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code });
  });

  it('responds 404 for an unknown photo and changes nothing', () => {
    expect(api.changePhotosKeywords({ photoIds: [ids['a.jpg'], 999999], add: ['x'] }).status).toBe(404);
    expect(fs.existsSync(path.join(dir, '.paloma.json'))).toBe(false);
  });

  it('responds 409 for a corrupt sidecar and writes nothing', () => {
    fs.writeFileSync(path.join(dirB, '.paloma.json'), '{broken');
    const result = api.changePhotosKeywords({ photoIds: [ids['a.jpg'], idB], add: ['x'] });
    expect(result.status).toBe(409);
    expect(fs.existsSync(path.join(dir, '.paloma.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dirB, '.paloma.json'), 'utf-8')).toBe('{broken');
  });
});
