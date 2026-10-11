import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openTestDatabase, startTestApp } from '../auth/testing.js';
import { connectMcp, INITIALIZE, postMcp } from './testClient.js';

// The MCP endpoint with users off
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_mcp_route_test_'));
  await (await import('../plugins/index.js')).pluginRegistry.init();
  app = await startTestApp();
});

afterAll(async () => {
  await app.close();
  cleanup();
});

describe('/api/mcp', () => {
  it('answers initialize as paloma with instructions to read the guide', async () => {
    const client = await connectMcp(app.base);
    try {
      expect(client.getServerVersion()).toMatchObject({ name: 'paloma' });
      expect(client.getInstructions()).toMatch(/guide/);
      expect(client.getServerCapabilities()).toMatchObject({ tools: expect.anything(), resources: expect.anything() });
    } finally {
      await client.close();
    }
  });

  it('needs no token with users off', async () => {
    const res = await postMcp(app.base, INITIALIZE);
    expect(res.status).toBe(200);
  });

  it('refuses requests from a foreign web page', async () => {
    const res = await postMcp(app.base, INITIALIZE, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('origin_not_allowed');
  });

  it('accepts requests from its own origin', async () => {
    expect((await postMcp(app.base, INITIALIZE, { Origin: app.origin })).status).toBe(200);
  });

  it('answers GET with 405, since it is stateless', async () => {
    expect((await fetch(`${app.base}/mcp`)).status).toBe(405);
  });
});
