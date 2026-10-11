import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let users: typeof import('../auth/users.js');
let anna: TestClient;
let annaId: string;

const login = async (username: string, password = 'correct horse battery') => {
  const c = new TestClient(app.base);
  const res = await c.post('/auth/login/password', { username, password });
  expect(res.status, `${username} login`).toBe(200);
  return c;
};

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_admin_routes_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
  users = await import('../auth/users.js');
  annaId = (await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse battery' })).id;
  await users.createUser({ username: 'eddie', roleId: 'editor', password: 'correct horse battery' });
  anna = await login('anna');
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('admin API', () => {
  it('needs users.manage', async () => {
    const ed = await login('eddie');
    for (const url of ['/admin/users', '/admin/roles', '/admin/permissions', '/admin/sessions', '/admin/tokens']) {
      const { status, body } = await ed.get(url);
      expect([status, body.params?.permission], url).toEqual([403, 'users.manage']);
    }
  });

  it('lists the permissions with texts in the requested language', async () => {
    const { body } = await anna.get('/admin/permissions?lang=uk');
    expect(body).toHaveLength(8);
    expect(body[0]).toEqual({ id: 'library.view', label: 'Перегляд бібліотеки', description: expect.any(String) });
  });

  it('creates, changes, disables, enables and deletes a user', async () => {
    const created = await anna.post('/admin/users', {
      username: 'ben', displayName: 'Ben', roleId: 'viewer', password: 'initial horse battery',
      access: { all: false, albums: ['trip'] }, quotas: { export_bytes: 1_000_000 },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ username: 'ben', mustChangePassword: true, access: { all: false, albums: ['trip'] } });
    const benId = created.body.id;

    const ben = await login('ben', 'initial horse battery');
    expect((await anna.patch(`/admin/users/${benId}`, { roleId: 'editor' })).body.roleId).toBe('editor');
    expect((await ben.get('/auth/me')).body.permissions).toContain('photos.edit');

    expect((await anna.patch(`/admin/users/${benId}`, { enabled: false })).body.enabled).toBe(false);
    expect((await ben.get('/photos')).status).toBe(401);
    expect((await new TestClient(app.base).post('/auth/login/password', { username: 'ben', password: 'initial horse battery' })).status).toBe(401);
    await anna.patch(`/admin/users/${benId}`, { enabled: true });
    await login('ben', 'initial horse battery');

    const list = (await anna.get('/admin/users')).body.map((u: { username: string }) => u.username);
    expect(list).toEqual(['anna', 'ben', 'eddie']);
    expect((await anna.delete(`/admin/users/${benId}`)).status).toBe(200);
    expect((await anna.get('/admin/users')).body.map((u: { username: string }) => u.username)).toEqual(['anna', 'eddie']);
  });

  it('resets a password, ending the user sessions', async () => {
    const carol = (await anna.post('/admin/users', { username: 'carol', roleId: 'viewer', password: 'initial horse battery' })).body;
    const session = await login('carol', 'initial horse battery');
    const reset = await anna.post(`/admin/users/${carol.id}/password`, { password: 'second horse battery' });
    expect([reset.status, reset.body.mustChangePassword]).toEqual([200, true]);
    expect((await session.get('/photos')).status).toBe(401);
    await login('carol', 'second horse battery');
  });

  it('keeps at least one administrator and refuses changes to oneself', async () => {
    const demote = await anna.patch(`/admin/users/${annaId}`, { roleId: 'editor' });
    expect([demote.status, demote.body.code]).toEqual([409, 'last_admin']);
    const disable = await anna.patch(`/admin/users/${annaId}`, { enabled: false });
    expect([disable.status, disable.body.code]).toEqual([409, 'self_change']);
    const remove = await anna.delete(`/admin/users/${annaId}`);
    expect([remove.status, remove.body.code]).toEqual([409, 'self_change']);
  });

  it('manages custom roles and refuses changing built-in ones', async () => {
    const family = await anna.post('/admin/roles', { name: 'Family', permissions: ['library.view', 'photos.edit', 'albums.manage'] });
    expect(family.status).toBe(201);
    const dan = (await anna.post('/admin/users', { username: 'dan', roleId: family.body.id, password: 'initial horse battery' })).body;
    const danClient = await login('dan', 'initial horse battery');
    expect((await danClient.get('/auth/me')).body.user.roleName).toBe('Family');
    expect((await danClient.post('/export', { photoIds: [1], outputDir: 'x' })).status).toBe(403);

    const inUse = await anna.delete(`/admin/roles/${family.body.id}`);
    expect([inUse.status, inUse.body.code, inUse.body.params.users]).toEqual([409, 'role_in_use', 1]);
    expect((await anna.patch('/admin/roles/editor', { name: 'X' })).body.code).toBe('role_builtin');

    const roles = (await anna.get('/admin/roles')).body;
    expect(roles.map((r: { id: string }) => r.id).slice(0, 3)).toEqual(['admin', 'editor', 'viewer']);
    expect(roles.find((r: { id: string }) => r.id === family.body.id).userCount).toBe(1);

    await anna.delete(`/admin/users/${dan.id}`);
    expect((await anna.delete(`/admin/roles/${family.body.id}`)).status).toBe(200);
  });

  it('refuses removing users.manage from the only administrators role', async () => {
    const keepers = (await anna.post('/admin/roles', { name: 'Keepers', permissions: ['library.view', 'users.manage'] })).body;
    await anna.patch(`/admin/users/${annaId}`, { roleId: keepers.id });
    const res = await anna.patch(`/admin/roles/${keepers.id}`, { permissions: ['library.view'] });
    expect([res.status, res.body.code]).toEqual([409, 'last_admin']);
    await anna.patch(`/admin/users/${annaId}`, { roleId: 'admin' });
  });

  it('lists and revokes the sessions of everyone', async () => {
    const ed = await login('eddie');
    const sessions = (await anna.get('/admin/sessions')).body;
    const edSession = sessions.find((s: { username: string }) => s.username === 'eddie');
    expect(sessions.find((s: { current: boolean }) => s.current).username).toBe('anna');
    expect((await anna.delete(`/admin/sessions/${edSession.id}`)).status).toBe(200);
    expect((await ed.get('/photos')).status).toBe(401);
  });
});

describe('server information', () => {
  it('needs plugins.manage and shows the configuration', async () => {
    const eddie = await login('eddie');
    const refused = await eddie.get('/server/info');
    expect([refused.status, refused.body.params?.permission]).toEqual([403, 'plugins.manage']);

    const { status, body } = await anna.get('/server/info');
    expect(status).toBe(200);
    expect(body).toMatchObject({ authMode: 'on', photosDirs: [], excludeDirs: [], sessionDays: 30, rateLimit: 600 });
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.exportDir).toMatch(/export$/);
  });
});
