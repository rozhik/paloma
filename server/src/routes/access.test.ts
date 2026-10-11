import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

/**
 * Library access with auth on, on a fixture library:
 *   2023/         a (2023-10-10, tag work, Roy), a2, a3        album Trip: a, b
 *   2024/         b (2022-10-10, tag birds, Ann)               album Best: b, d, a2
 *   2024/summer/  c, c2
 *   2024x/        d (Ann)
 * anna: admin; ben: viewer with folder 2024; carol: editor with album Trip; dan: editor with folder 2024.
 */
let tmpDir: string;
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
let users: typeof import('../auth/users.js');
const id: Record<string, number> = {};
const dir: Record<string, string> = {};
const folderId: Record<string, number> = {};
let anna: TestClient;
let ben: TestClient;
let carol: TestClient;
let dan: TestClient;

const ROY = 'aaaaaaaaaaaaaaaa';
const ANN = 'bbbbbbbbbbbbbbbb';

async function login(username: string): Promise<TestClient> {
  const c = new TestClient(app.base);
  expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_access_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  app = await startTestApp();
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  users = await import('../auth/users.js');

  // The library as the scanner leaves it: photo rows, and folder files that hold albums, tags, places and people
  const photo = (name: string, folder: string, values: Partial<typeof schema.photos.$inferInsert> = {}) => {
    fs.writeFileSync(path.join(dir[folder], `${name}.jpg`), '');
    id[name] = db.insert(schema.photos).values({
      folderId: folderId[folder], filename: `${name}.jpg`, fileHash: `hash-${name}`, createdAt: '', ...values,
    }).returning().get().id;
  };
  for (const name of ['2023', '2024', '2024/summer', '2024x']) {
    dir[name] = path.join(tmpDir, 'photos', name);
    fs.mkdirSync(dir[name], { recursive: true });
    folderId[name] = db.insert(schema.folders).values({ path: dir[name], name: path.basename(name), indexedAt: '' }).returning().get().id;
  }
  photo('a', '2023', { dateTaken: '2023-10-10T10:00:00.000Z' });
  photo('a2', '2023', { dateTaken: '2023-10-09T10:00:00.000Z' });
  photo('a3', '2023', { dateTaken: '2023-10-11T10:00:00.000Z' });
  photo('b', '2024', { dateTaken: '2022-10-10T10:00:00.000Z' });
  photo('c', '2024/summer', { dateTaken: '2022-10-09T10:00:00.000Z' });
  photo('c2', '2024/summer', { dateTaken: '2022-10-11T10:00:00.000Z' });
  photo('d', '2024x');
  const face = (person: string) => [{ rect: { left: 0.1, top: 0.1, right: 0.3, bottom: 0.3 }, person }];
  const sidecars: Record<string, Record<string, unknown>> = {
    '2023': {
      albums: { trip: { name: 'Trip' }, best: { name: 'Best' } },
      people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } },
      photos: {
        'a.jpg': { keywords: ['work'], albums: ['trip'], faces: face(ROY), geotag: { lat: 48, lon: 24 } },
        'a2.jpg': { albums: ['best'] },
      },
    },
    '2024': {
      albums: { trip: { name: 'Trip' }, best: { name: 'Best' } },
      people: { [ANN]: { name: 'Ann', email: null, googleId: null } },
      photos: { 'b.jpg': { keywords: ['birds'], albums: ['trip', 'best'], faces: face(ANN), geotag: { lat: 50, lon: 30 } } },
    },
    '2024x': { albums: { best: { name: 'Best' } }, photos: { 'd.jpg': { albums: ['best'], faces: face(ANN) } } },
  };
  const { reapplyFolder } = await import('../services/folderChanges.js');
  for (const [name, content] of Object.entries(sidecars)) {
    fs.writeFileSync(path.join(dir[name], '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, ...content }));
    await reapplyFolder(dir[name]);
  }

  await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse battery' });
  await users.createUser({ username: 'ben', roleId: 'viewer', password: 'correct horse battery', access: { all: false, folders: [dir['2024']] } });
  await users.createUser({ username: 'carol', roleId: 'editor', password: 'correct horse battery', access: { all: false, albums: ['trip'] } });
  await users.createUser({ username: 'dan', roleId: 'editor', password: 'correct horse battery', access: { all: false, folders: [dir['2024']] } });
  [anna, ben, carol, dan] = await Promise.all(['anna', 'ben', 'carol', 'dan'].map(login));
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

const names = (photos: { filename: string }[]) => photos.map((p) => p.filename.replace('.jpg', '')).sort();

describe('photos', () => {
  it('lists only the photos of granted folders with subfolders, or of granted albums', async () => {
    expect(names((await anna.get('/photos')).body)).toEqual(['a', 'a2', 'a3', 'b', 'c', 'c2', 'd']);
    expect(names((await ben.get('/photos')).body)).toEqual(['b', 'c', 'c2']);
    expect(names((await carol.get('/photos')).body)).toEqual(['a', 'b']);
    // Filters cannot reach past the access
    expect(names((await ben.get(`/photos?folderId=${folderId['2023']}`)).body)).toEqual([]);
    expect(names((await ben.get(`/photos?ids=${id.a},${id.b}`)).body)).toEqual(['b']);
    expect(names((await ben.get('/photos?query=work')).body)).toEqual([]);
  });

  it('counts only visible photos in the statistics', async () => {
    expect((await anna.get('/photos/stats')).body.photoCount).toBe(7);
    const { body } = await ben.get('/photos/stats');
    expect(body.photoCount).toBe(3);
    expect(body.albums.map((a: { token: string; photoCount: number }) => [a.token, a.photoCount]).sort()).toEqual([['best', 1], ['trip', 1]]);
    expect(body.people.map((p: { id: string }) => p.id)).toEqual([ANN]);
  });

  it('lists only the tags of visible photos', async () => {
    expect((await anna.get('/tags')).body.map((t: { name: string }) => t.name)).toEqual(['birds', 'work']);
    expect((await ben.get('/tags')).body.map((t: { name: string }) => t.name)).toEqual(['birds']);
  });

  it('makes memories only from visible photos', async () => {
    const years = async (c: TestClient) => (await c.get('/memories?date=2026-10-10')).body.map((m: { year: number; photoCount: number }) => [m.year, m.photoCount]);
    expect(await years(anna)).toEqual([[2023, 3], [2022, 3]]);
    expect(await years(ben)).toEqual([[2022, 3]]);
  });

  it('lists only granted folders with the photos the user sees', async () => {
    const folders = (await ben.get('/folders')).body.map((f: { path: string; photoCount: number }) => [f.path, f.photoCount]);
    expect(folders).toEqual([[dir['2024'], 1], [dir['2024/summer'], 2]]);
    expect((await carol.get('/folders')).body).toEqual([]);
    expect((await anna.get('/folders')).body).toHaveLength(4);
  });

  it('answers 404 for the info of a photo outside the access', async () => {
    expect((await ben.get(`/photos/${id.a}/info`)).status).toBe(404);
    expect((await ben.get(`/photos/${id.b}/info`)).status).toBe(200);
  });

  it('changes only visible photos', async () => {
    const hidden = await dan.patch(`/photos/${id.a}/star`, { isStarred: true });
    expect([hidden.status, hidden.body.code]).toEqual([404, 'photo_not_found']);
    expect(JSON.parse(fs.readFileSync(path.join(dir['2023'], '.paloma.json'), 'utf-8')).photos['a.jpg'].star).toBeUndefined();

    const batch = await dan.post('/photos/keywords', { photoIds: [id.b, id.a], add: ['x'] });
    expect([batch.status, batch.body.code]).toEqual([404, 'photo_not_found']);
    const location = await dan.post('/photos/location', { photoIds: [id.d], location: { lat: 1, lon: 2 } });
    expect(location.status).toBe(404);
    expect((await dan.put(`/photos/${id.a}/edits`, { edits: [] })).status).toBe(404);

    expect((await dan.patch(`/photos/${id.c}/star`, { isStarred: true })).status).toBe(200);
  });
});

describe('albums', () => {
  const counts = async (c: TestClient) => (await c.get('/albums')).body
    .map((a: { name: string; photoCount: number }) => [a.name, a.photoCount]);

  it('lists granted albums and albums with visible photos, counting only those', async () => {
    expect(await counts(anna)).toEqual([['Best', 3], ['Trip', 2]]);
    expect(await counts(ben)).toEqual([['Best', 1], ['Trip', 1]]);
    expect(await counts(carol)).toEqual([['Best', 1], ['Trip', 2]]);
  });

  it('refuses to change an album seen only through folder access', async () => {
    const { status, body } = await dan.patch('/albums/best', { name: 'Renamed' });
    expect([status, body.code]).toEqual([403, 'album_not_granted']);
    expect((await dan.post('/albums/best/photos', { photoIds: [id.c] })).status).toBe(403);
    expect((await dan.delete('/albums/best')).status).toBe(403);
    expect((await anna.get('/albums')).body.find((a: { token: string }) => a.token === 'best').name).toBe('Best');
  });

  it('lets a user change an album granted to them', async () => {
    const { status, body } = await carol.patch('/albums/trip', { description: 'Summer trip' });
    expect([status, body.description, body.photoCount]).toEqual([200, 'Summer trip', 2]);
  });

  it('answers 404 for an album without visible photos', async () => {
    const secret = await anna.post('/albums', { name: 'Secret', photoIds: [id.a3] });
    expect(secret.status).toBe(200);
    expect((await ben.get('/albums')).body.some((a: { name: string }) => a.name === 'Secret')).toBe(false);
    expect((await dan.patch(`/albums/${secret.body.token}`, { name: 'Mine' })).status).toBe(404);
    expect((await ben.get(`/photos?album=${secret.body.token}`)).body).toEqual([]);
  });

  it('gives a new album to its creator, made only of photos they see', async () => {
    expect((await dan.post('/albums', { name: 'Hidden', photoIds: [id.a] })).status).toBe(404);

    const created = await dan.post('/albums', { name: "Dan's picks", photoIds: [id.b, id.c] });
    expect([created.status, created.body.photoCount]).toEqual([200, 2]);
    expect((await dan.get('/auth/me')).body.access.albums).toContain(created.body.token);
    expect((await dan.patch(`/albums/${created.body.token}`, { name: 'Picks' })).body.name).toBe('Picks');
    // Adding photos is limited to photos the user sees
    expect((await dan.post(`/albums/${created.body.token}/photos`, { photoIds: [id.d] })).status).toBe(404);
  });
});

describe('people and faces', () => {
  const people = async (c: TestClient) => (await c.get('/people')).body
    .map((p: { name: string; photoCount: number }) => [p.name, p.photoCount]).sort();

  it('lists only people on visible photos, counting only those photos', async () => {
    expect(await people(anna)).toEqual([['Ann', 2], ['Roy Avery', 1]]);
    expect(await people(ben)).toEqual([['Ann', 1]]);
  });

  it('answers 404 for a person only on photos outside the access', async () => {
    for (const url of [`/people/${ROY}`, `/people/${ROY}/avatar`, `/people/${ROY}/faces`, `/people/${ROY}/similar`]) {
      expect((await ben.get(url)).status, url).toBe(404);
    }
    expect((await ben.get(`/people/${ANN}`)).body.photoCount).toBe(1);
    expect((await ben.get(`/photos?person=${ROY}`)).body).toEqual([]);
    expect((await dan.patch(`/people/${ROY}`, { comment: 'x' })).status).toBe(404);
  });

  it('shows only the faces on visible photos', async () => {
    expect((await ben.get(`/people/${ANN}/faces`)).body.map((f: { photoId: number }) => f.photoId)).toEqual([id.b]);
    expect((await ben.get(`/photos/${id.a}/people`)).status).toBe(404);
    expect((await ben.get(`/photos/${id.a}/face?rect=0.1,0.1,0.3,0.3`)).status).toBe(404);
  });

  it('refuses to delete a person who is also on photos outside the access', async () => {
    const { status, body } = await dan.delete(`/people/${ANN}`);
    expect([status, body.code]).toEqual([403, 'outside_access']);
    expect((await anna.get(`/people/${ANN}`)).status).toBe(200);
  });

  it('runs face detection only on visible photos', async () => {
    const pending = await dan.post('/faces/pending', { photoIds: [id.a, id.b], detector: 'test' });
    expect(pending.body.pending).toEqual([id.b]);
    const saved = await dan.put(`/photos/${id.a}/detected-faces`, { detector: 'test', fileHash: 'hash-a', faces: [] });
    expect(saved.status).toBe(404);
  });
});

describe('places', () => {
  it('puts only visible photos on the map', async () => {
    const points = async (c: TestClient) => (await c.get('/geo/points')).body.map((p: { id: number }) => p.id).sort();
    expect(await points(anna)).toEqual([id.a, id.b].sort());
    expect(await points(ben)).toEqual([id.b]);
  });
});

describe('images', () => {
  beforeAll(async () => {
    const sharp = (await import('sharp')).default;
    for (const name of ['a', 'b']) {
      const folder = name === 'a' ? '2023' : '2024';
      await sharp({ create: { width: 64, height: 48, channels: 3, background: '#808080' } }).jpeg()
        .toFile(path.join(dir[folder], `${name}.jpg`));
    }
    const cacheDir = path.join(tmpDir, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    for (const name of ['a', 'b']) {
      for (const size of ['thumb', 'preview']) fs.writeFileSync(path.join(cacheDir, `hash-${name}_${size}.webp`), 'webp');
    }
  });

  it('serves every kind of image of a visible photo and none of a hidden one', async () => {
    const urls = (photo: string) => [
      `/photos/${id[photo]}/thumbnail`, `/photos/${id[photo]}/preview`, `/raw/${id[photo]}`,
      `/cache/thumbnail/hash-${photo}`, `/cache/preview/hash-${photo}`, `/photos/${id[photo]}/face-source`,
    ];
    for (const url of urls('b')) expect((await ben.get(url)).status, url).toBe(200);
    for (const url of urls('a')) expect((await ben.get(url)).status, url).toBe(404);
    for (const url of urls('a')) expect((await anna.get(url)).status, url).toBe(200);
  });

  it('serves avatars only of visible people', async () => {
    expect((await ben.get(`/people/${ROY}/avatar`)).status).toBe(404);
    expect((await anna.get(`/people/${ROY}/avatar`)).status).toBe(200);
  });
});
