import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { connectMcp, INITIALIZE, postMcp } from './testClient.js';

// The MCP endpoint with users on: API tokens only, revocation and the request rate
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let anna: TestClient;

const token = async (name: string, permissions = ['library.view']) => {
  const res = await anna.post('/auth/tokens', { name, permissions });
  expect(res.status).toBe(201);
  return res.body as { id: string; value: string };
};

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_mcp_auth_test_', { PALOMA_AUTH: 'on', PALOMA_RATE_LIMIT: '20' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await (await import('../plugins/index.js')).pluginRegistry.init();
  app = await startTestApp();
  const users = await import('../auth/users.js');
  await users.createUser({ username: 'anna', roleId: 'editor', password: 'correct horse battery' });
  anna = new TestClient(app.base);
  expect((await anna.post('/auth/login/password', { username: 'anna', password: 'correct horse battery' })).status).toBe(200);
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('/api/mcp with users on', () => {
  it('asks for a bearer token', async () => {
    const res = await postMcp(app.base, INITIALIZE);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer realm="paloma"');
  });

  it('does not accept a login cookie', async () => {
    const res = await postMcp(app.base, INITIALIZE, { Cookie: anna.cookie! });
    expect(res.status).toBe(401);
  });

  it('connects with a token and stops when it is revoked', async () => {
    const { id, value } = await token('claude');
    const client = await connectMcp(app.base, value);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    await client.close();
    expect((await anna.delete(`/auth/tokens/${id}`)).status).toBe(200);
    expect((await postMcp(app.base, INITIALIZE, { Authorization: `Bearer ${value}` })).status).toBe(401);
  });

  it('counts MCP requests toward the request rate', async () => {
    const { value } = await token('busy');
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await postMcp(app.base, INITIALIZE, { Authorization: `Bearer ${value}` })).status);
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
