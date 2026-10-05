import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { eq } from 'drizzle-orm';
import type { PalomaFolderFile } from '../../../shared/types.js';
import type { AlbumCopy } from './albumApi.js';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let api: typeof import('./albumApi.js');
let Scanner: typeof import('./FolderScannerService.js').FolderScannerService;
let Sidecar: typeof import('./SidecarService.js').SidecarService;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_album_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  api = await import('./albumApi.js');
  await (await import('../plugins/index.js')).pluginRegistry.init();
  ({ FolderScannerService: Scanner } = await import('./FolderScannerService.js'));
  ({ SidecarService: Sidecar } = await import('./SidecarService.js'));
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let root: string;
let a: string;
let b: string;
let c: string;
const ids: Record<string, number> = {};

/** A library folder with empty photo files; `photo` rows are inserted directly, as the scanner would. */
function addFolder(name: string, files: Array<[string, string | null]>): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const folderId = db.insert(schema.folders).values({ path: dir, name, indexedAt: '' })
    .returning({ id: schema.folders.id }).get().id;
  for (const [filename, dateTaken] of files) {
    fs.writeFileSync(path.join(dir, filename), '');
    ids[`${name}/${filename}`] = db.insert(schema.photos)
      .values({ folderId, filename, fileHash: `${name}-${filename}`, dateTaken, createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
  }
  return dir;
}

/** Loads a folder's files into the library, as the watcher does. */
const sync = (...dirs: string[]): void => dirs.forEach((dir) => Scanner.applyFolderState(dir, Sidecar.getFolderState(dir)));

const writeSidecar = (dir: string, content: Partial<PalomaFolderFile>): void =>
  fs.writeFileSync(path.join(dir, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, photos: {}, ...content }));
const readSidecar = (dir: string): PalomaFolderFile => JSON.parse(fs.readFileSync(path.join(dir, '.paloma.json'), 'utf-8'));
const hasSidecar = (dir: string): boolean => fs.existsSync(path.join(dir, '.paloma.json'));
const writeIni = (dir: string, ...lines: string[]): Buffer => {
  const bytes = Buffer.from(lines.map((line) => `${line}\r\n`).join(''));
  fs.writeFileSync(path.join(dir, '.picasa.ini'), bytes);
  return bytes;
};

beforeEach(() => {
  for (const table of [schema.edits, schema.albumPhotos, schema.folderAlbums, schema.photos, schema.folders]) db.delete(table).run();
  root = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
  a = addFolder('a', [['1.jpg', '2024-01-01'], ['2.jpg', '2024-03-01']]);
  b = addFolder('b', [['3.jpg', '2024-02-01']]);
  c = addFolder('c', [['4.jpg', null]]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of [a, b, c]) fs.chmodSync(dir, 0o755);
});

const copy = (folderPath: string, rest: Partial<AlbumCopy> = {}): AlbumCopy => ({
  folderPath, name: null, date: null, location: null, description: null, cover: null, modified: null, ...rest,
});

describe('resolveAlbum', () => {
  it('prefers the newest Paloma change over a path-earlier copy', () => {
    expect(api.resolveAlbum([
      copy('/a', { name: 'Old' }),
      copy('/b', { name: 'Newer', modified: '2026-10-02T00:00:00.000Z' }),
      copy('/c', { name: 'New', modified: '2026-10-03T00:00:00.000Z' }),
    ])?.name).toBe('New');
  });

  it('takes the first named copy by path when nothing was changed in Paloma', () => {
    expect(api.resolveAlbum([copy('/c', { name: 'C' }), copy('/a'), copy('/b', { name: 'B' })])?.name).toBe('B');
  });
});

describe('listAlbums', () => {
  beforeEach(() => {
    writeSidecar(a, {
      albums: { birds: { name: 'Birds', description: 'Spring', location: 'Kyiv' }, unnamed: {}, empty: { name: 'Empty' } },
      photos: { '1.jpg': { albums: ['birds', 'unnamed'] }, '2.jpg': { albums: ['birds'] } },
    });
    writeSidecar(b, { albums: { birds: { name: 'Birds' } }, photos: { '3.jpg': { albums: ['birds'], hidden: true } } });
    sync(a, b);
  });

  it('lists albums with members, sorted by name with untitled last', () => {
    expect(api.listAlbums().map((album) => [album.token, album.name])).toEqual([['birds', 'Birds'], ['unnamed', null]]);
  });

  it('counts photos that are not hidden and returns the definition fields', () => {
    expect(api.getAlbum('birds')).toMatchObject({
      name: 'Birds', description: 'Spring', location: 'Kyiv', photoCount: 2, coverThumbnailUrl: '/api/cache/thumbnail/a-2.jpg',
    });
  });

  it('gives the cover its rendered thumbnail when the cover photo is edited', () => {
    db.insert(schema.edits).values({ photoId: ids['a/2.jpg'], editInstructionsJson: '[{"filter":"bw"}]', updatedAt: '' }).run();
    expect(api.getAlbum('birds')?.coverThumbnailUrl).toMatch(new RegExp(`^/api/photos/${ids['a/2.jpg']}/thumbnail\\?r=[0-9a-f]{12}$`));
    db.delete(schema.edits).run();
  });

  it('uses the first non-hidden photo in list order as the default cover', () => {
    expect(api.getAlbum('birds')?.coverPhotoId).toBe(ids['a/2.jpg']);
  });

  it('uses a chosen cover while it is a non-hidden member', () => {
    writeSidecar(a, {
      albums: { birds: { name: 'Birds', cover: '1.jpg' } },
      photos: { '1.jpg': { albums: ['birds'] }, '2.jpg': { albums: ['birds'] } },
    });
    sync(a);
    expect(api.getAlbum('birds')?.coverPhotoId).toBe(ids['a/1.jpg']);

    writeSidecar(a, {
      albums: { birds: { name: 'Birds', cover: '1.jpg' } },
      photos: { '1.jpg': { albums: ['birds'], hidden: true }, '2.jpg': { albums: ['birds'] } },
    });
    sync(a);
    expect(api.getAlbum('birds')?.coverPhotoId).toBe(ids['a/2.jpg']);

    writeSidecar(a, { albums: { birds: { name: 'Birds', cover: '1.jpg' } }, photos: { '2.jpg': { albums: ['birds'] } } });
    sync(a);
    expect(api.getAlbum('birds')?.coverPhotoId).toBe(ids['a/2.jpg']);
  });
});

describe('album changes', () => {
  const create = (name: string, photoKeys: string[], extra: Record<string, unknown> = {}) => {
    const result = api.createAlbumFromPhotos({ name, photoIds: photoKeys.map((key) => ids[key]), ...extra });
    expect(result.status).toBe(200);
    return (result.body as { token: string }).token;
  };

  it('creates an album across two folders with the same token and name', () => {
    const token = create('Trip', ['a/1.jpg', 'b/3.jpg'], { description: 'Summer' });

    expect(token).toMatch(/^[0-9a-f]{32}$/);
    for (const dir of [a, b]) {
      expect(readSidecar(dir).albums?.[token]).toMatchObject({ name: 'Trip', description: 'Summer', modified: expect.any(String) });
      expect(readSidecar(dir).albums?.[token].date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    }
    expect(readSidecar(a).photos['1.jpg'].albums).toEqual([token]);
    expect(api.getAlbum(token)).toMatchObject({ name: 'Trip', description: 'Summer', photoCount: 2 });
  });

  it('copies the definition into a new folder when photos are added', () => {
    const token = create('Birds', ['a/1.jpg']);
    const result = api.addAlbumPhotos(token, { photoIds: [ids['c/4.jpg']] });

    expect(result).toMatchObject({ status: 200, body: { photoCount: 2 } });
    expect(readSidecar(c).albums?.[token]).toMatchObject({ name: 'Birds' });
    expect(readSidecar(c).photos['4.jpg'].albums).toEqual([token]);
  });

  it('unlists the album when its last photo is removed and keeps the photo', () => {
    const token = create('Solo', ['a/1.jpg']);
    const result = api.removeAlbumPhotos(token, { photoIds: [ids['a/1.jpg']] });

    expect(result).toEqual({ status: 200, body: { success: true, removed: true } });
    expect(api.getAlbum(token)).toBeUndefined();
    expect(fs.existsSync(path.join(a, '1.jpg'))).toBe(true);
  });

  it('renames in every defining folder and in a Picasa-only folder without touching the .ini', () => {
    const token = create('Birds', ['a/1.jpg', 'b/3.jpg']);
    const ini = writeIni(c, `[.album:${token}]`, 'name=Birds', `token=${token}`, '[4.jpg]', `albums=${token}`);
    sync(c);
    expect(hasSidecar(c)).toBe(false);

    const result = api.editAlbumProperties(token, { name: 'Birds of Ukraine' });

    expect(result).toMatchObject({ status: 200, body: { name: 'Birds of Ukraine', photoCount: 3 } });
    for (const dir of [a, b, c]) expect(readSidecar(dir).albums?.[token]).toMatchObject({ name: 'Birds of Ukraine', modified: expect.any(String) });
    expect(readSidecar(c).photos['4.jpg']).toEqual({ albums: [token] });
    expect(fs.readFileSync(path.join(c, '.picasa.ini')).equals(ini)).toBe(true);
  });

  it('sets and clears description and location', () => {
    const token = create('Trip', ['a/1.jpg', 'b/3.jpg']);
    expect(api.editAlbumProperties(token, { description: 'Spring', location: 'Kyiv' }))
      .toMatchObject({ status: 200, body: { description: 'Spring', location: 'Kyiv' } });
    expect(readSidecar(b).albums?.[token]).toMatchObject({ description: 'Spring', location: 'Kyiv' });

    expect(api.editAlbumProperties(token, { location: '' })).toMatchObject({ status: 200, body: { location: null } });
    for (const dir of [a, b]) expect(readSidecar(dir).albums?.[token]).not.toHaveProperty('location');
  });

  it('stores a chosen cover only in its folder and resets it with null', () => {
    const token = create('Trip', ['a/1.jpg', 'b/3.jpg']);

    expect(api.editAlbumProperties(token, { coverPhotoId: ids['b/3.jpg'] }))
      .toMatchObject({ status: 200, body: { coverPhotoId: ids['b/3.jpg'] } });
    expect(readSidecar(b).albums?.[token].cover).toBe('3.jpg');
    expect(readSidecar(a).albums?.[token]).not.toHaveProperty('cover');

    expect(api.editAlbumProperties(token, { coverPhotoId: ids['c/4.jpg'] }))
      .toMatchObject({ status: 400, body: { code: 'cover_not_in_album' } });

    expect(api.editAlbumProperties(token, { coverPhotoId: null })).toMatchObject({ body: { coverPhotoId: ids['b/3.jpg'] } });
    expect(readSidecar(b).albums?.[token]).not.toHaveProperty('cover');
    expect(api.editAlbumProperties(token, { coverPhotoId: ids['a/1.jpg'] }).status).toBe(200);
    expect(api.getAlbum(token)?.coverPhotoId).toBe(ids['a/1.jpg']);
  });

  it('keeps the cover after the library is rebuilt from disk', () => {
    const token = create('Trip', ['a/1.jpg', 'a/2.jpg', 'b/3.jpg']);
    api.editAlbumProperties(token, { coverPhotoId: ids['a/1.jpg'] });

    for (const table of [schema.albumPhotos, schema.folderAlbums]) db.delete(table).run();
    sync(a, b, c);

    expect(api.getAlbum(token)?.coverPhotoId).toBe(ids['a/1.jpg']);
  });

  it('deletes the album everywhere and keeps all photos', () => {
    const token = create('Trip', ['a/1.jpg', 'b/3.jpg']);
    writeSidecar(c, { photos: { 'gone.jpg': { albums: [token] } }, albums: { [token]: { name: 'Trip' } } });
    sync(c);
    const photoCount = db.select().from(schema.photos).all().length;

    expect(api.deleteAlbumEverywhere(token)).toEqual({ status: 200, body: { success: true } });

    for (const dir of [a, b, c]) {
      const data = readSidecar(dir);
      expect(data.albums ?? {}).not.toHaveProperty(token);
      expect(JSON.stringify(data.photos)).not.toContain(token);
    }
    expect(api.getAlbum(token)).toBeUndefined();
    expect(db.select().from(schema.photos).all()).toHaveLength(photoCount);
  });

  it('rejects a change with 409 and writes nothing when one sidecar is corrupt', () => {
    fs.writeFileSync(path.join(b, '.paloma.json'), '{broken');
    const result = api.createAlbumFromPhotos({ name: 'Trip', photoIds: [ids['a/1.jpg'], ids['b/3.jpg']] });

    const file = path.join(b, '.paloma.json');
    expect(result).toEqual({
      status: 409,
      body: { error: expect.any(String), code: 'sidecar_unreadable', params: { files: file }, failedFolders: [b] },
    });
    expect(hasSidecar(a)).toBe(false);
    expect(fs.readFileSync(path.join(b, '.paloma.json'), 'utf-8')).toBe('{broken');
    expect(api.listAlbums()).toEqual([]);
  });

  it.skipIf(process.getuid?.() === 0)('writes the other folders and names a read-only one', () => {
    const token = create('Birds', ['a/1.jpg', 'b/3.jpg']);
    fs.chmodSync(b, 0o555);

    const result = api.editAlbumProperties(token, { name: 'Renamed' });

    expect(result).toMatchObject({
      status: 500, body: { code: 'sidecar_write_failed', params: { folders: b }, failedFolders: [b] },
    });
    expect(readSidecar(a).albums?.[token].name).toBe('Renamed');
    expect(readSidecar(b).albums?.[token].name).toBe('Birds');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(b), expect.anything());
    expect(api.getAlbum(token)?.name).toBe('Renamed');
  });

  it.each([
    [{ name: '  ', photoIds: [1] }, 'album_name_required'],
    [{ name: 'Trip', photoIds: [] }, 'photo_ids_required'],
    [{ name: 'Trip' }, 'photo_ids_required'],
    [{ name: 5, photoIds: [1] }, 'album_name_required'],
    [{ name: 'Trip', photoIds: [1], description: 3 }, 'invalid_field'],
    [[], 'invalid_body'],
  ])('rejects an invalid create body %j with 400 and code %s', (body, code) => {
    expect(api.createAlbumFromPhotos(body)).toMatchObject({ status: 400, body: { code, error: expect.any(String) } });
    expect(api.listAlbums()).toEqual([]);
  });

  it('rejects an invalid edit with 400 and unknown albums or photos with 404', () => {
    const token = create('Trip', ['a/1.jpg']);
    expect(api.editAlbumProperties(token, {})).toMatchObject({ status: 400, body: { code: 'no_album_fields' } });
    expect(api.editAlbumProperties(token, { name: '' })).toMatchObject({ status: 400, body: { code: 'album_name_required' } });
    expect(api.editAlbumProperties(token, { location: 1 }))
      .toMatchObject({ status: 400, body: { code: 'invalid_field', params: { field: 'location' } } });
    expect(api.editAlbumProperties('nope', { name: 'x' })).toMatchObject({ status: 404, body: { code: 'album_not_found' } });
    expect(api.addAlbumPhotos(token, { photoIds: [999999] })).toMatchObject({ status: 404, body: { code: 'photo_not_found' } });
    expect(api.createAlbumFromPhotos({ name: 'X', photoIds: [999999] }))
      .toMatchObject({ status: 404, body: { code: 'photo_not_found' } });
    expect(readSidecar(a).albums?.[token].name).toBe('Trip');
  });
});

describe('deleted album and Picasa re-import', () => {
  it('stays deleted after an unrelated .ini change and returns when Picasa adds a member', () => {
    const t = 'c9ea9fa67022f38a3c771894d2a8a468';
    writeIni(a, `[.album:${t}]`, 'name=Birds', '[1.jpg]', `albums=${t}`);
    sync(a);
    expect(api.getAlbum(t)?.name).toBe('Birds');

    expect(api.deleteAlbumEverywhere(t).status).toBe(200);
    expect(api.getAlbum(t)).toBeUndefined();

    writeIni(a, `[.album:${t}]`, 'name=Birds', '[1.jpg]', `albums=${t}`, 'star=yes');
    sync(a);
    expect(api.getAlbum(t)).toBeUndefined();

    writeIni(a, `[.album:${t}]`, 'name=Birds', '[1.jpg]', `albums=${t}`, 'star=yes', '[2.jpg]', `albums=${t}`);
    sync(a);
    expect(api.getAlbum(t)).toMatchObject({ name: 'Birds', photoCount: 1 });
    expect(db.select().from(schema.albumPhotos).where(eq(schema.albumPhotos.token, t)).all())
      .toEqual([{ photoId: ids['a/2.jpg'], token: t }]);
  });
});
