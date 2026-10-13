import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { KeymapFile } from '../../../shared/types.js';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

/** The keymap API with users on. anna: admin; ben: editor; vera: viewer. */
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let users: typeof import('../auth/users.js');
const client: Record<string, TestClient> = {};
const userId: Record<string, string> = {};

const keymap = (sections: KeymapFile['sections'], extra: Partial<KeymapFile> = {}): KeymapFile => ({
  format: 'paloma-keymap', version: 1, name: 'My keys', basedOn: 'windows', sections, ...extra,
});
const nextOnN = keymap([{ id: 'viewer', actions: [{ id: 'viewer.next', keys: ['N'] }] }]);

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_keymap_routes_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
  users = await import('../auth/users.js');
  for (const [username, roleId] of [['anna', 'admin'], ['ben', 'editor'], ['vera', 'viewer']]) {
    userId[username] = (await users.createUser({ username, roleId, password: 'correct horse battery' }, { mustChangePassword: false })).id;
    client[username] = new TestClient(app.base);
    expect((await client[username].post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
  }
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('keymap API', () => {
  it('needs a login', async () => {
    const anonymous = new TestClient(app.base);
    expect((await anonymous.get('/keymap')).status).toBe(401);
    expect((await anonymous.put('/keymap', nextOnN)).status).toBe(401);
  });

  it('has nothing stored before the user saves', async () => {
    const res = await client.anna.get('/keymap');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ keymap: null });
  });

  it('saves and reads back a keymap', async () => {
    const saved = await client.anna.put('/keymap', nextOnN);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ keymap: nextOnN, dropped: [] });
    expect((await client.anna.get('/keymap')).body).toEqual({ keymap: nextOnN });
  });

  it('keeps users separate', async () => {
    await client.anna.put('/keymap', nextOnN);
    expect((await client.ben.get('/keymap')).body).toEqual({ keymap: null });
  });

  it('lets a viewer save keys', async () => {
    expect((await client.vera.put('/keymap', keymap([], { basedOn: 'tvBox', name: 'TV box' }))).status).toBe(200);
    expect((await client.vera.get('/keymap')).body.keymap).toMatchObject({ basedOn: 'tvBox', name: 'TV box', sections: [] });
  });

  it('lets an API token read the keymap', async () => {
    const token = await client.ben.post('/auth/tokens', { name: 'script', permissions: ['library.view'] });
    expect(token.status).toBe(201);
    const bearer = new TestClient(app.base, token.body.value);
    expect((await bearer.get('/keymap')).status).toBe(200);
  });

  it('refuses a key shared by two actions, names them, and keeps the stored keymap', async () => {
    await client.anna.put('/keymap', nextOnN);
    const res = await client.anna.put('/keymap', keymap([{ id: 'viewer', actions: [{ id: 'viewer.close', keys: ['I'] }] }]));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'invalid_keymap', problems: [{ code: 'conflict', key: 'I', actions: ['viewer.close', 'viewer.info'] }] });
    expect((await client.anna.get('/keymap')).body).toEqual({ keymap: nextOnN });
  });

  it('refuses what is not a keymap', async () => {
    const res = await client.anna.put('/keymap', { version: 1, photos: { 'a.jpg': { star: true } } });
    expect(res.status).toBe(400);
    expect(res.body.problems).toEqual([{ code: 'not_keymap' }]);
  });

  it('refuses a request over 256 KB', async () => {
    const big = keymap([{ id: 'viewer', actions: [{ id: 'viewer.next', name: 'x'.repeat(300 * 1024), keys: ['N'] }] }]);
    const res = await client.anna.put('/keymap', big);
    expect(res.status).toBe(400);
    expect(res.body.problems).toEqual([{ code: 'too_large' }]);
  });

  it('reports unknown actions it left out', async () => {
    const res = await client.ben.put('/keymap', keymap([{ id: 'viewer', actions: [{ id: 'viewer.teleport', keys: ['T'] }, { id: 'viewer.next', keys: ['N'] }] }]));
    expect(res.status).toBe(200);
    expect(res.body.dropped).toEqual(['viewer.teleport']);
    expect(res.body.keymap.sections).toEqual([{ id: 'viewer', actions: [{ id: 'viewer.next', keys: ['N'] }] }]);
  });

  it('lists the presets with every action', async () => {
    const res = await client.vera.get('/keymap/presets');
    expect(res.status).toBe(200);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual(['mac', 'windows', 'tvBox']);
    const viewer = res.body[0].keymap.sections.find((s: { id: string }) => s.id === 'viewer');
    expect(viewer.actions.find((a: { id: string }) => a.id === 'viewer.next').keys).toEqual(['ArrowRight']);
  });

  it('deletes a deleted user\'s keymap and leaves the others', async () => {
    const carl = await users.createUser({ username: 'carl', roleId: 'viewer', password: 'correct horse battery' }, { mustChangePassword: false });
    const carlClient = new TestClient(app.base);
    await carlClient.post('/auth/login/password', { username: 'carl', password: 'correct horse battery' });
    expect((await carlClient.put('/keymap', nextOnN)).status).toBe(200);
    await users.deleteUser(userId.anna, carl.id);
    const { connection } = await import('../db/index.js');
    expect(connection().prepare('SELECT owner FROM keymaps WHERE owner = ?').all(carl.id)).toEqual([]);
    expect((await client.anna.get('/keymap')).body.keymap).not.toBeNull();
  });
});
