import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let server: Server;
let base: string;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_stats_routes_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  await (await import('../db/index.js')).openDatabase();
  const { default: express } = await import('express');
  // Typed as the module under CommonJS interop; at runtime `default` is the router
  const router = (await import('./index.js')).default as unknown as import('express').Router;
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const stats = async (query: string) => {
  const res = await fetch(`${base}/photos/stats?${query}`);
  return { status: res.status, body: await res.json() };
};

/** A folder on disk and in the library. */
const folder = (name: string) => {
  const dir = path.join(tmpDir, name);
  fs.mkdirSync(dir);
  return { dir, id: db.insert(schema.folders).values({ path: dir, name, indexedAt: '' }).returning({ id: schema.folders.id }).get().id };
};

type PhotoValues = typeof schema.photos.$inferInsert;
let next = 0;
/** A library photo of the folder, with an empty file on disk. */
const photo = (folderId: number, dir: string, values: Partial<PhotoValues> = {}) => {
  const filename = `${next++}.jpg`;
  fs.writeFileSync(path.join(dir, filename), '');
  return db.insert(schema.photos).values({ folderId, filename, fileHash: filename, createdAt: '', ...values })
    .returning({ id: schema.photos.id }).get().id;
};

/** Names of the files in a folder with their modification times. */
const snapshot = (dir: string) => fs.readdirSync(dir).sort().map((name) => [name, fs.statSync(path.join(dir, name)).mtimeMs]);

describe('GET /api/photos/stats', () => {
  it('totals every matching photo that is not hidden, beyond a page of photos', async () => {
    const big = folder('big');
    const rows = Array.from({ length: 600 }, (_, i) => ({
      folderId: big.id, filename: `b${i}.jpg`, fileHash: `b${i}`, createdAt: '', fileSize: 1000,
    }));
    db.insert(schema.photos).values(rows).run();
    // Hidden photos do not count
    photo(big.id, big.dir, { fileSize: 5000, isHidden: true });

    const { status, body } = await stats(`folderId=${big.id}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ photoCount: 600, totalSize: 600_000, undatedCount: 600 });
    expect(body.folders).toEqual([{ id: big.id, name: 'big', path: big.dir, photoCount: 600 }]);
  });

  it('counts dates, stars, locations and saved edits, and lists albums and people', async () => {
    const trip = folder('trip');
    const other = folder('other');
    const a = photo(trip.id, trip.dir, { fileSize: 1024, dateTaken: '2024-05-01T10:00:00.000Z', isStarred: true, latitude: 48, longitude: 24 });
    const b = photo(trip.id, trip.dir, { fileSize: 2048, dateTaken: '2024-05-09T10:00:00.000Z' });
    const c = photo(other.id, other.dir, { fileSize: 3072 });
    db.insert(schema.edits).values({ photoId: a, editInstructionsJson: '[{"filter":"crop64","rect":{"left":0,"top":0,"right":0.5,"bottom":1}}]', updatedAt: '' }).run();
    db.insert(schema.albumPhotos).values([{ photoId: a, token: 'tok1' }, { photoId: b, token: 'tok1' }, { photoId: c, token: 'tok1' }, { photoId: c, token: 'tok2' }]).run();
    db.insert(schema.folderAlbums).values({ folderId: trip.id, token: 'tok1', name: 'Trip' }).run();
    db.insert(schema.photoPeople).values([
      { photoId: a, contactId: 'aaaaaaaaaaaaaaaa', position: 0 }, { photoId: b, contactId: 'aaaaaaaaaaaaaaaa', position: 0 },
      { photoId: c, contactId: 'bbbbbbbbbbbbbbbb', position: 0 },
    ]).run();
    db.insert(schema.folderPeople).values({ folderId: trip.id, contactId: 'aaaaaaaaaaaaaaaa', name: 'Ann' }).run();

    const before = [snapshot(trip.dir), snapshot(other.dir)];
    const { status, body } = await stats('album=tok1');
    expect(status).toBe(200);
    expect(body).toEqual({
      photoCount: 3,
      totalSize: 6144,
      takenFrom: '2024-05-01T10:00:00.000Z',
      takenTo: '2024-05-09T10:00:00.000Z',
      undatedCount: 1,
      starredCount: 1,
      geotaggedCount: 1,
      modifiedCount: 1,
      folders: [{ id: trip.id, name: 'trip', path: trip.dir, photoCount: 2 }, { id: other.id, name: 'other', path: other.dir, photoCount: 1 }],
      albums: [{ token: 'tok1', name: 'Trip', photoCount: 3 }, { token: 'tok2', name: null, photoCount: 1 }],
      people: [{ id: 'aaaaaaaaaaaaaaaa', name: 'Ann', photoCount: 2 }, { id: 'bbbbbbbbbbbbbbbb', name: null, photoCount: 1 }],
    });
    // Read-only: nothing in the photo folders changes
    expect([snapshot(trip.dir), snapshot(other.dir)]).toEqual(before);
    expect(fs.existsSync(path.join(trip.dir, '.paloma.json'))).toBe(false);
  });

  it('sorts equal counts by name', async () => {
    const f = folder('sorted');
    const ids = [photo(f.id, f.dir), photo(f.id, f.dir)];
    db.insert(schema.albumPhotos).values([{ photoId: ids[0], token: 'zz' }, { photoId: ids[1], token: 'yy' }]).run();
    db.insert(schema.folderAlbums).values([{ folderId: f.id, token: 'zz', name: 'Beta' }, { folderId: f.id, token: 'yy', name: 'Alpha' }]).run();
    const { body } = await stats(`folderId=${f.id}`);
    expect(body.albums.map((album: { name: string }) => album.name)).toEqual(['Alpha', 'Beta']);
  });

  it('gives zeros and empty lists when nothing matches', async () => {
    const { status, body } = await stats('album=nothing');
    expect(status).toBe(200);
    expect(body).toEqual({
      photoCount: 0, totalSize: 0, takenFrom: null, takenTo: null, undatedCount: 0, starredCount: 0, geotaggedCount: 0,
      modifiedCount: 0, folders: [], albums: [], people: [],
    });
  });

  it('rejects an invalid date with 400 invalid_date', async () => {
    const { status, body } = await stats('takenFrom=2024-13-01');
    expect(status).toBe(400);
    expect(body.code).toBe('invalid_date');
  });
});
