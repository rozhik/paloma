import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

/** The keymap API with users off: the one user has one keymap. */
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_keymap_single_test_'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('keymap API with users off', () => {
  it('stores one keymap for the single user', async () => {
    const browser = new TestClient(app.base);
    const file = { format: 'paloma-keymap', version: 1, name: 'TV box', basedOn: 'tvBox', sections: [] };
    expect((await browser.get('/keymap')).body).toEqual({ keymap: null });
    expect((await browser.put('/keymap', file)).status).toBe(200);
    // Another browser of the same install
    expect((await new TestClient(app.base).get('/keymap')).body).toEqual({ keymap: file });
  });
});
