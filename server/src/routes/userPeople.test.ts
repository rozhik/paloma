import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

/**
 * Users linked with people, and avatars, with auth on:
 *   family/  a.jpg (face of Ben Avery)
 *   work/    b.jpg (face of Carol Avery)
 * anna: admin; ben: viewer; carol: viewer; dave: viewer limited to work/.
 */
let tmpDir: string;
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let users: typeof import('../auth/users.js');
let sharp: typeof import('sharp');
const ids: Record<string, string> = {};
const BEN = 'aaaaaaaaaaaaaaaa';
const CAROL = 'bbbbbbbbbbbbbbbb';
let anna: TestClient;
let ben: TestClient;

const login = async (username: string) => {
  const c = new TestClient(app.base);
  expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
  return c;
};

/** Sends raw bytes, as the browser sends a file. */
const upload = (client: TestClient, body: Buffer, type: string) => fetch(`${app.base}/auth/avatar`, {
  method: 'PUT', headers: { 'Content-Type': type, Cookie: client.cookie! }, body: new Uint8Array(body),
}).then(async (res) => ({ status: res.status, body: await res.json() }));

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_user_people_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  app = await startTestApp();
  users = await import('../auth/users.js');
  sharp = (await import('sharp')).default;
  const { db } = await import('../db/index.js');
  const schema = await import('../db/schema.js');
  const { reapplyFolder } = await import('../services/folderChanges.js');

  const face = (person: string) => [{ rect: { left: 0.2, top: 0.2, right: 0.6, bottom: 0.6 }, person }];
  for (const [folder, file, person, name] of [['family', 'a.jpg', BEN, 'Ben Avery'], ['work', 'b.jpg', CAROL, 'Carol Avery']]) {
    const dir = path.join(tmpDir, 'photos', folder);
    fs.mkdirSync(dir, { recursive: true });
    await sharp({ create: { width: 200, height: 150, channels: 3, background: '#808080' } }).jpeg().toFile(path.join(dir, file));
    const folderId = db.insert(schema.folders).values({ path: dir, name: folder, indexedAt: '' }).returning().get().id;
    db.insert(schema.photos).values({ folderId, filename: file, fileHash: `hash-${file}`, createdAt: '' }).run();
    fs.writeFileSync(path.join(dir, '.paloma.json'), JSON.stringify({
      format: 'paloma-folder', version: 2,
      people: { [person]: { name, email: null, googleId: null } },
      photos: { [file]: { faces: face(person) } },
    }));
    await reapplyFolder(dir);
  }
  for (const [username, roleId, access] of [
    ['anna', 'admin', undefined], ['ben', 'viewer', undefined], ['carol', 'viewer', undefined],
    ['dave', 'viewer', { all: false, folders: [path.join(tmpDir, 'photos', 'work')] }],
  ] as const) {
    ids[username] = (await users.createUser({ username, roleId, password: 'correct horse battery', ...(access ? { access } : {}) })).id;
  }
  anna = await login('anna');
  ben = await login('ben');
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('linking users with people', () => {
  it('links a user with a person, without changing their access', async () => {
    const { status, body } = await anna.patch(`/admin/users/${ids.ben}`, { personId: BEN });
    expect([status, body.personId, body.personName, body.access]).toEqual([200, BEN, 'Ben Avery', { all: true }]);
    const me = (await ben.get('/auth/me')).body;
    expect(me.user).toMatchObject({ personId: BEN, personName: 'Ben Avery', personVisible: true });
    // Without an avatar of his own, he shows the person's face
    expect(me.user.avatarUrl).toMatch(new RegExp(`^/api/people/${BEN}/avatar\\?v=`));
  });

  it('refuses a person linked with another user, naming that user', async () => {
    const { status, body } = await anna.patch(`/admin/users/${ids.carol}`, { personId: BEN });
    expect([status, body.code, body.params.username]).toEqual([409, 'person_linked', 'ben']);
    expect((await anna.get('/admin/users')).body.find((u: { username: string }) => u.username === 'carol').personId).toBeNull();
  });

  it('refuses an unknown person', async () => {
    expect((await anna.patch(`/admin/users/${ids.carol}`, { personId: 'cccccccccccccccc' })).status).toBe(400);
    expect((await anna.patch(`/admin/users/${ids.carol}`, { personId: 'not-an-id' })).status).toBe(400);
  });

  it('shows the person face only when the user may see the person', async () => {
    // Linked with Carol Avery, whose photo dave can see: her face
    expect((await anna.patch(`/admin/users/${ids.dave}`, { personId: CAROL })).status).toBe(200);
    const dave = await login('dave');
    expect((await dave.get('/auth/me')).body.user.avatarUrl).toMatch(/\/api\/people\/b{16}\/avatar/);
    // Linked with Ben Avery, whose only photo dave cannot see: initials
    await anna.patch(`/admin/users/${ids.dave}`, { personId: null });
    await anna.patch(`/admin/users/${ids.ben}`, { personId: null });
    await anna.patch(`/admin/users/${ids.dave}`, { personId: BEN });
    expect((await dave.get('/auth/me')).body.user).toMatchObject({ personId: BEN, avatarUrl: null, personVisible: false });
    await anna.patch(`/admin/users/${ids.dave}`, { personId: null });
    await anna.patch(`/admin/users/${ids.ben}`, { personId: BEN });
  });

  it('shows the linked user on the person', async () => {
    expect((await anna.get(`/people/${BEN}`)).body.user).toEqual({ username: 'ben', displayName: 'ben' });
    expect((await anna.get(`/people/${CAROL}`)).body.user).toBeNull();
  });

  it('removes the link when the person is deleted', async () => {
    await anna.patch(`/admin/users/${ids.carol}`, { personId: CAROL });
    expect((await anna.delete(`/people/${CAROL}`)).status).toBe(200);
    expect((await anna.get('/admin/users')).body.find((u: { username: string }) => u.username === 'carol').personId).toBeNull();
  });
});

describe('avatars', () => {
  it('stores an uploaded photo as a square of at most 256 pixels, outside the photo folders', async () => {
    const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#c04040' } }).jpeg().toBuffer();
    const { status, body } = await upload(ben, photo, 'image/jpeg');
    expect(status).toBe(200);
    expect(body.user.avatarUrl).toMatch(new RegExp(`^/api/users/${ids.ben}/avatar\\?v=[0-9a-f]{12}$`));

    const res = await fetch(`${app.origin}${body.user.avatarUrl}`, { headers: { Cookie: anna.cookie! } });
    expect([res.status, res.headers.get('content-type')]).toEqual([200, 'image/webp']);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([256, 256]);
    expect(fs.existsSync(path.join(tmpDir, 'data', 'avatars', `${ids.ben}.webp`))).toBe(true);
    for (const folder of ['family', 'work']) expect(fs.readdirSync(path.join(tmpDir, 'photos', folder)).some((f) => f.endsWith('.webp')), folder).toBe(false);
    expect((await anna.get('/admin/users')).body.find((u: { username: string }) => u.username === 'ben').avatarUrl).toBe(body.user.avatarUrl);
  });

  it('refuses a file that is not an image and keeps the avatar', async () => {
    const before = (await ben.get('/auth/me')).body.user.avatarUrl;
    for (const [content, type] of [[Buffer.from('hello'), 'image/jpeg'], [Buffer.from('hello'), 'text/plain'], [Buffer.alloc(11 * 1024 * 1024), 'image/png']] as const) {
      const { status, body } = await upload(ben, content, type);
      expect([status, body.code], type).toEqual([400, 'avatar_invalid']);
    }
    expect((await ben.get('/auth/me')).body.user.avatarUrl).toBe(before);
  });

  it('removes the own avatar, falling back to the person face', async () => {
    const { status, body } = await ben.delete('/auth/avatar');
    expect(status).toBe(200);
    expect(body.user.avatarUrl).toMatch(new RegExp(`^/api/people/${BEN}/avatar`));
    expect(fs.existsSync(path.join(tmpDir, 'data', 'avatars', `${ids.ben}.webp`))).toBe(false);
  });

  it('lets an administrator remove the avatar of another user, and nobody else', async () => {
    const photo = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#40c040' } }).png().toBuffer();
    await upload(ben, photo, 'image/png');
    const carol = await login('carol');
    expect((await carol.delete(`/admin/users/${ids.ben}/avatar`)).status).toBe(403);
    const { status, body } = await anna.delete(`/admin/users/${ids.ben}/avatar`);
    expect([status, body.avatarUrl]).toEqual([200, expect.stringMatching(/^\/api\/people\//)]);
  });

  it('needs a login to see an avatar', async () => {
    expect((await new TestClient(app.base).get(`/users/${ids.ben}/avatar`)).status).toBe(401);
  });
});
