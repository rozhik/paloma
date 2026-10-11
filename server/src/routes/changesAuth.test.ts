import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { buildLibrary, type TestLibrary } from '../model/testLibrary.js';

// POST /api/changes with users on: the permission of each change, through API tokens
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let lib: TestLibrary;
let viewer: TestClient;
let tagger: TestClient;

const ROY = 'b8e4117cf1d6615b';

beforeAll(async () => {
  let tmpDir: string;
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_changes_auth_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
  const users = await import('../auth/users.js');
  await users.createUser({ username: 'anna', roleId: 'editor', password: 'correct horse battery' });
  const anna = new TestClient(app.base);
  expect((await anna.post('/auth/login/password', { username: 'anna', password: 'correct horse battery' })).status).toBe(200);
  const token = async (permissions: string[]) => (await anna.post('/auth/tokens', { name: permissions.join(' '), permissions })).body.value as string;
  viewer = new TestClient(app.base, await token(['library.view']));
  tagger = new TestClient(app.base, await token(['library.view', 'photos.edit']));
  lib = await buildLibrary(path.join(tmpDir, 'photos'), {
    a: { photos: { p: {} }, sidecar: { people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } }, photos: {} } },
  });
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('POST /api/changes with users on', () => {
  it('refuses a token that can only view', async () => {
    const res = await viewer.post('/changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.p, set: { star: true } }] });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'permission_required', params: { permission: 'photos.edit' } });
    expect(lib.hasSidecar('a')).toBe(true);
    expect(lib.readSidecar('a').photos['p.jpg']).toBeUndefined();
  });

  it('names the permission a change lacks and changes nothing', async () => {
    const res = await tagger.post('/changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.p, set: { caption: 'x', people: { add: [ROY] } } }] });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'permission_required', params: { index: 0, permission: 'people.manage' } });
    expect(lib.readSidecar('a').photos['p.jpg']).toBeUndefined();
  });

  it('applies what the token may change', async () => {
    const res = await tagger.post('/changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.p, set: { caption: 'x' } }] });
    expect(res.status).toBe(200);
    expect(lib.readSidecar('a').photos['p.jpg']).toMatchObject({ caption: 'x' });
  });
});
