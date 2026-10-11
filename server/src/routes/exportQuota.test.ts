import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

let tmpDir: string;
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let users: typeof import('../auth/users.js');
const ids: number[] = [];
let hiddenId: number;
let anna: TestClient;
let ben: TestClient;
let benId: string;
let photoSize: number;

const login = async (username: string) => {
  const c = new TestClient(app.base);
  expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
  return c;
};
const files = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_export_quota_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
  users = await import('../auth/users.js');
  const { db } = await import('../db/index.js');
  const schema = await import('../db/schema.js');
  const sharp = (await import('sharp')).default;

  // Ten photos with the same content, so every exported file has the same size
  const image = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg().toBuffer();
  for (const name of ['shared', 'private']) {
    const dir = path.join(tmpDir, 'photos', name);
    fs.mkdirSync(dir, { recursive: true });
    const folderId = db.insert(schema.folders).values({ path: dir, name, indexedAt: '' }).returning().get().id;
    for (let i = 0; i < (name === 'shared' ? 10 : 1); i++) {
      fs.writeFileSync(path.join(dir, `p${i}.jpg`), image);
      const id = db.insert(schema.photos).values({ folderId, filename: `p${i}.jpg`, fileHash: `${name}${i}`, createdAt: '' }).returning().get().id;
      if (name === 'shared') ids.push(id);
      else hiddenId = id;
    }
  }
  await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse battery' });
  benId = (await users.createUser({
    username: 'ben', roleId: 'editor', password: 'correct horse battery', access: { all: false, folders: [path.join(tmpDir, 'photos', 'shared')] },
  })).id;
  anna = await login('anna');
  ben = await login('ben');

  const probe = await anna.post('/export', { photoIds: [ids[0]], outputDir: 'probe' });
  photoSize = fs.statSync(probe.body.exportedFiles[0]).size;
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('export folders', () => {
  it('writes into the user own folder', async () => {
    expect(fs.existsSync(path.join(tmpDir, 'export', 'anna', 'probe', 'exported_p0.jpg'))).toBe(true);
    const { status, body } = await ben.post('/export', { photoIds: [ids[0], ids[1]], outputDir: 'holiday' });
    expect([status, body.count]).toEqual([200, 2]);
    expect(files(path.join(tmpDir, 'export', 'ben', 'holiday'))).toEqual(['exported_p0.jpg', 'exported_p1.jpg']);
    fs.rmSync(path.join(tmpDir, 'export', 'ben'), { recursive: true });
  });

  it('refuses a destination outside the user folder', async () => {
    for (const outputDir of ['../anna', '/tmp']) {
      expect((await ben.post('/export', { photoIds: [ids[0]], outputDir })).status, outputDir).toBe(400);
    }
    expect(files(path.join(tmpDir, 'export', 'anna'))).toEqual(['probe']);
  });

  it('exports only photos the user sees', async () => {
    const { body } = await ben.post('/export', { photoIds: [hiddenId], outputDir: 'hidden' });
    expect(body.count).toBe(0);
    expect(files(path.join(tmpDir, 'export', 'ben', 'hidden'))).toEqual([]);
  });
});

describe('export space quota', () => {
  it('stops before the file that would cross the limit, keeping what was written', async () => {
    await users.updateUser(null, benId, { quotas: { export_bytes: Math.floor(4.5 * photoSize) } });
    const { status, body } = await ben.post('/export', { photoIds: ids, outputDir: 'holiday' });
    expect([status, body.count, body.requested, body.quotaExceeded, body.success]).toEqual([200, 4, 10, true, false]);
    expect(files(path.join(tmpDir, 'export', 'ben', 'holiday'))).toHaveLength(4);
    expect((await ben.get('/auth/me')).body.quotas[0]).toMatchObject({ kind: 'export_bytes', used: 4 * photoSize });
  });

  it('refuses an export when the space is full', async () => {
    await users.updateUser(null, benId, { quotas: { export_bytes: 4 * photoSize } });
    const { status, body } = await ben.post('/export', { photoIds: [ids[5]], outputDir: 'more' });
    expect([status, body.code]).toEqual([409, 'quota_exceeded']);
    expect(fs.existsSync(path.join(tmpDir, 'export', 'ben', 'more'))).toBe(false);
  });

  it('counts only the files that remain after deleting some outside Paloma', async () => {
    fs.rmSync(path.join(tmpDir, 'export', 'ben', 'holiday', 'exported_p0.jpg'));
    expect((await ben.post('/export', { photoIds: [ids[5]], outputDir: 'more' })).body.count).toBe(1);
  });

  it('refuses a movie when the space is full, and removes a movie that does not fit', async () => {
    const full = await ben.post('/creation/movie', { photoIds: [ids[0]], durationPerSlide: 1 });
    expect([full.status, full.body.code]).toEqual([409, 'quota_exceeded']);

    fs.rmSync(path.join(tmpDir, 'export', 'ben'), { recursive: true });
    await users.updateUser(null, benId, { quotas: { export_bytes: 100 } });
    const tooBig = await ben.post('/creation/movie', { photoIds: [ids[0]], durationPerSlide: 1, outputFilename: 'clip' });
    expect([tooBig.status, tooBig.body.code]).toEqual([409, 'quota_exceeded']);
    expect(files(path.join(tmpDir, 'export', 'ben'))).toEqual([]);

    await users.updateUser(null, benId, { quotas: { export_bytes: null } });
    const made = await ben.post('/creation/movie', { photoIds: [ids[0]], durationPerSlide: 1, outputFilename: 'clip' });
    expect([made.status, made.body.moviePath]).toEqual([200, path.join(tmpDir, 'export', 'ben', 'clip.mp4')]);
    expect(fs.readdirSync(path.join(tmpDir, 'data', 'tmp_movie'))).toEqual([]);
  }, 30_000);
});
