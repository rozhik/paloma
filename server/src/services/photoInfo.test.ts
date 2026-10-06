import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let dir: string;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
let info: typeof import('./photoInfo.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_info_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  info = await import('./photoInfo.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let photoId: number;

beforeEach(async () => {
  for (const table of [schema.albumPhotos, schema.folderAlbums, schema.photoPeople, schema.folderPeople, schema.photos, schema.folders]) {
    db.delete(table).run();
  }
  dir = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
  await sharp({ create: { width: 40, height: 30, channels: 3, background: '#468' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'Canon', Model: 'Canon EOS 80D' } })
    .toFile(path.join(dir, 'a.jpg'));
  const folderId = db.insert(schema.folders).values({ path: dir, name: 'photos', indexedAt: '' })
    .returning({ id: schema.folders.id }).get().id;
  photoId = db.insert(schema.photos).values({ folderId, filename: 'a.jpg', fileHash: 'a', width: 40, height: 30, createdAt: '' })
    .returning({ id: schema.photos.id }).get().id;
});

const listing = () => fs.readdirSync(dir).sort().map((name) => [name, fs.statSync(path.join(dir, name)).mtimeMs]);

describe('getPhotoInfo', () => {
  it('responds 404 for an unknown photo', async () => {
    expect((await info.getPhotoInfo(999999, 'en')).status).toBe(404);
  });

  it('returns file facts, albums, people and EXIF without changing any file', async () => {
    db.insert(schema.albumPhotos).values({ photoId, token: 'c9ea' }).run();
    const folderId = db.select().from(schema.folders).get()!.id;
    db.insert(schema.folderAlbums).values({ folderId, token: 'c9ea', name: 'Birds' }).run();
    db.insert(schema.photoPeople).values({ photoId, contactId: 'b8e4117cf1d6615b', position: 0 }).run();
    db.insert(schema.folderPeople).values({ folderId, contactId: 'b8e4117cf1d6615b', name: 'Roy Avery' }).run();
    const before = listing();

    const result = await info.getPhotoInfo(photoId, 'en');

    expect(result.status).toBe(200);
    const body = result.body as import('../../../shared/types.js').PhotoInfo;
    expect(body.file).toMatchObject({ path: path.join(dir, 'a.jpg'), size: fs.statSync(path.join(dir, 'a.jpg')).size });
    expect(body.albums).toEqual([{ token: 'c9ea', name: 'Birds' }]);
    expect(body.people).toEqual([{ id: 'b8e4117cf1d6615b', name: 'Roy Avery', avatarVersion: null, rects: [] }]);
    expect(body.exif?.Image).toMatchObject({ Make: 'Canon', Model: 'Canon EOS 80D' });
    expect(body.entry).toEqual({ source: 'none' });
    expect(body.faces).toEqual([]);
    expect(listing()).toEqual(before);
  });

  it('returns the sidecar entry as stored, unknown keys included', async () => {
    const entry = { star: true, rotate: 90, modified: '2026-10-01T10:00:00.000Z' };
    fs.writeFileSync(path.join(dir, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': entry } }));
    expect((await info.getPhotoInfo(photoId, 'en')).body).toMatchObject({ entry: { source: 'paloma', json: entry } });
  });

  it('returns the Picasa fields while the folder has no sidecar', async () => {
    fs.writeFileSync(path.join(dir, '.picasa.ini'), '[a.jpg]\r\nstar=yes\r\n');
    expect((await info.getPhotoInfo(photoId, 'en')).body).toMatchObject({ entry: { source: 'ini', json: { star: true } } });
  });

  it('says when the sidecar is unreadable', async () => {
    fs.writeFileSync(path.join(dir, '.paloma.json'), '{broken');
    expect((await info.getPhotoInfo(photoId, 'en')).body).toMatchObject({ entry: { source: 'unreadable' } });
  });
});

describe('exifValueText', () => {
  it('shows binary values only with their size and cuts long texts', () => {
    expect(info.exifValueText(Buffer.alloc(4000))).toEqual({ binary: 4000 });
    expect(info.exifValueText(new Array(200).fill(1))).toEqual({ binary: 200 });
    expect(info.exifValueText(5.6)).toBe('5.6');
    expect(info.exifValueText([1, 2])).toBe('1, 2');
    expect(info.exifValueText('x'.repeat(3000))).toHaveLength(info.MAX_EXIF_TEXT + 1);
  });
});
