import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

let tmpDir: string;
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let users: typeof import('../auth/users.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
let anna: TestClient;
let ben: TestClient;
let annaId: string;
let benId: string;

const login = async (username: string) => {
  const c = new TestClient(app.base);
  expect((await c.post('/auth/login/password', { username, password: 'correct horse battery' })).status).toBe(200);
  return c;
};

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_tokens_routes_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
  users = await import('../auth/users.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  annaId = (await users.createUser({ username: 'anna', roleId: 'editor', password: 'correct horse battery' })).id;
  benId = (await users.createUser({ username: 'ben', roleId: 'viewer', password: 'correct horse battery' })).id;
  await users.createUser({ username: 'root', roleId: 'admin', password: 'correct horse battery' });
  anna = await login('anna');
  ben = await login('ben');
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

const createToken = async (client: TestClient, body: Record<string, unknown>) => {
  const res = await client.post('/auth/tokens', body);
  expect(res.status).toBe(201);
  return res.body as { id: string; value: string };
};

describe('creating a token', () => {
  it('shows the value once and lists the token without it', async () => {
    const { body, status } = await anna.post('/auth/tokens', { name: 'frame', permissions: ['library.view'] });
    expect(status).toBe(201);
    expect(body).toMatchObject({ name: 'frame', permissions: ['library.view'], username: 'anna', expiresAt: null, lastUsedAt: null });
    expect(body.value).toMatch(/^pal_[A-Za-z0-9_-]{40,}$/);

    const list = (await anna.get('/auth/tokens')).body;
    expect(list.map((t: { name: string }) => t.name)).toEqual(['frame']);
    expect(JSON.stringify(list)).not.toContain(body.value);
  });

  it('never stores the value in the database', async () => {
    const { value } = await createToken(anna, { name: 'secret', permissions: ['library.view'] });
    expect(JSON.stringify(db.select().from(schema.apiTokens).all())).not.toContain(value);
    const file = path.join(tmpDir, 'data', 'paloma.db');
    for (const f of [file, `${file}-wal`]) {
      if (fs.existsSync(f)) expect(fs.readFileSync(f).includes(value)).toBe(false);
    }
  });

  it('refuses permissions the owner does not have', async () => {
    const { status, body } = await anna.post('/auth/tokens', { name: 'too much', permissions: ['library.view', 'users.manage'] });
    expect([status, body.code]).toEqual([403, 'token_scope_exceeded']);
    expect((await anna.get('/auth/tokens')).body.some((t: { name: string }) => t.name === 'too much')).toBe(false);
  });

  it('needs account.tokens', async () => {
    const { status, body } = await ben.post('/auth/tokens', { name: 'x', permissions: ['library.view'] });
    expect([status, body.code, body.params.permission]).toEqual([403, 'permission_required', 'account.tokens']);
  });

  it('refuses invalid fields', async () => {
    for (const body of [{ name: '', permissions: ['library.view'] }, { name: 'x', permissions: [] }, { name: 'x', permissions: ['library.view'], expiresAt: '2001-01-01' }]) {
      expect((await anna.post('/auth/tokens', body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('using a token', () => {
  it('acts as the owner and records when it was last used', async () => {
    const { id, value } = await createToken(anna, { name: 'script', permissions: ['library.view'] });
    const script = new TestClient(app.base, value);
    expect((await script.get('/photos')).status).toBe(200);
    expect((await script.get('/auth/me')).body).toMatchObject({ via: 'token', user: { username: 'anna' }, permissions: ['library.view'] });
    const listed = (await anna.get('/auth/tokens')).body.find((t: { id: string }) => t.id === id);
    expect(listed.lastUsedAt).not.toBeNull();
  });

  it('cannot do more than the token allows', async () => {
    const { value } = await createToken(anna, { name: 'viewer', permissions: ['library.view'] });
    const { status, body } = await new TestClient(app.base, value).patch('/photos/12/star', { isStarred: true });
    expect([status, body.params?.permission]).toEqual([403, 'photos.edit']);
  });

  it('loses a permission when the owner role loses it', async () => {
    const { value } = await createToken(anna, { name: 'exporter', permissions: ['library.view', 'export'] });
    const script = new TestClient(app.base, value);
    expect((await script.get('/auth/me')).body.permissions).toEqual(['library.view', 'export']);
    await users.updateUser(null, annaId, { roleId: 'viewer' });
    try {
      const { status, body } = await script.post('/export', { photoIds: [1], outputDir: 'x' });
      expect([status, body.params?.permission]).toEqual([403, 'export']);
    } finally {
      await users.updateUser(null, annaId, { roleId: 'editor' });
    }
  });

  it('stops working when expired', async () => {
    const { id, value } = await createToken(anna, { name: 'short', permissions: ['library.view'], expiresAt: '2099-01-01T00:00:00Z' });
    const script = new TestClient(app.base, value);
    expect((await script.get('/photos')).status).toBe(200);
    db.update(schema.apiTokens).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.apiTokens.id, id)).run();
    expect((await script.get('/photos')).status).toBe(401);
  });

  it('stops working while the owner is disabled and works again when enabled', async () => {
    const { value } = await createToken(anna, { name: 'owner', permissions: ['library.view'] });
    const script = new TestClient(app.base, value);
    await users.updateUser(null, annaId, { enabled: false });
    expect((await script.get('/photos')).status).toBe(401);
    await users.updateUser(null, annaId, { enabled: true });
    expect((await script.get('/photos')).status).toBe(200);
    anna = await login('anna');
  });

  it('stops working while auth-token is off', async () => {
    const root = await login('root');
    const { value } = await createToken(anna, { name: 'plugin', permissions: ['library.view'] });
    const script = new TestClient(app.base, value);
    expect((await root.patch('/plugins/auth-token', { enabled: false })).status).toBe(200);
    expect((await script.get('/photos')).status).toBe(401);
    expect((await root.patch('/plugins/auth-token', { enabled: true })).status).toBe(200);
    expect((await script.get('/photos')).status).toBe(200);
  });
});

describe('revoking tokens', () => {
  it('revokes an own token at once', async () => {
    const { id, value } = await createToken(anna, { name: 'gone', permissions: ['library.view'] });
    expect((await anna.delete(`/auth/tokens/${id}`)).status).toBe(200);
    expect((await anna.get('/auth/tokens')).body.some((t: { id: string }) => t.id === id)).toBe(false);
    expect((await new TestClient(app.base, value).get('/photos')).status).toBe(401);
  });

  it('cannot revoke a token of another user', async () => {
    const { id } = await createToken(anna, { name: 'annas', permissions: ['library.view'] });
    const { status, body } = await ben.delete(`/auth/tokens/${id}`);
    expect([status, body.code]).toEqual([404, 'token_not_found']);
  });

  it('lets an administrator list and revoke the tokens of everyone', async () => {
    const root = await login('root');
    const { id, value } = await createToken(anna, { name: 'frame-2', permissions: ['library.view'] });
    const listed = (await root.get('/admin/tokens')).body.find((t: { id: string }) => t.id === id);
    expect(listed).toMatchObject({ username: 'anna', name: 'frame-2' });
    expect((await anna.get('/admin/tokens')).status).toBe(403);
    expect((await root.delete(`/admin/tokens/${id}`)).status).toBe(200);
    expect((await new TestClient(app.base, value).get('/photos')).status).toBe(401);
  });
});

describe('deleting the owner', () => {
  it('ends their tokens', async () => {
    const { value } = await createToken(await login('root'), { name: 'root', permissions: ['library.view'] });
    const carol = await users.createUser({ username: 'carol', roleId: 'admin', password: 'correct horse battery' });
    const carolClient = await login('carol');
    const carolToken = await createToken(carolClient, { name: 'carols', permissions: ['library.view'] });
    await users.deleteUser(null, carol.id);
    expect((await new TestClient(app.base, carolToken.value).get('/photos')).status).toBe(401);
    expect((await new TestClient(app.base, value).get('/photos')).status).toBe(200);
    expect(benId).toBeTruthy();
  });
});
