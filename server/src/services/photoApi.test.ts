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

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_api_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  api = await import('./photoApi.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
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

describe('listPhotos and listFolders', () => {
  it('leaves hidden photos out unless includeHidden=true, and does not count them', () => {
    api.updatePhoto(ids['b.jpg'], { isHidden: true });

    expect(api.listPhotos({ folderId: String(folderId) }).map((p) => p.filename).sort()).toEqual(['a.jpg', 'c.jpg']);
    expect(api.listPhotos({ folderId: String(folderId), includeHidden: 'true' })).toHaveLength(3);
    expect(api.listFolders().find((f) => f.id === folderId)?.photoCount).toBe(2);
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
