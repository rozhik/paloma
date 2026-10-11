import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openTestDatabase, startTestApp } from '../auth/testing.js';
import { INITIALIZE, postMcp } from './testClient.js';

let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_mcp_off_test_', { PALOMA_MCP: 'off' }));
  app = await startTestApp();
});

afterAll(async () => {
  await app.close();
  cleanup();
});

describe('/api/mcp with PALOMA_MCP=off', () => {
  it('does not exist', async () => {
    expect((await postMcp(app.base, INITIALIZE)).status).toBe(404);
  });
});

describe('server information with PALOMA_MCP=off', () => {
  it('says MCP is off', async () => {
    const res = await fetch(`${app.base}/server/info`);
    expect((await res.json()).mcp).toEqual({ enabled: false, path: '/api/mcp' });
  });
});
