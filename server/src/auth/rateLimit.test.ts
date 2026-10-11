import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { openTestDatabase, startTestApp, TestClient } from './testing.js';

// config.ts reads the environment at import time, so everything is imported after it is set
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let RateLimiter: typeof import('./rateLimit.js').RateLimiter;
let isImageRequest: typeof import('./rateLimit.js').isImageRequest;

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_rate_test_', { PALOMA_AUTH: 'on' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ RateLimiter, isImageRequest } = await import('./rateLimit.js'));
  app = await startTestApp();
  const users = await import('./users.js');
  await users.createUser({ username: 'ben', roleId: 'editor', password: 'correct horse battery', quotas: { requests_per_minute: 5 } });
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

describe('RateLimiter', () => {
  it('allows the limit per minute and says how long to wait', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 120; i++) expect(limiter.hit('token:t1', 120, 1000 + i)).toBe(0);
    expect(limiter.hit('token:t1', 120, 30_000)).toBe(31);
    // Other keys have their own count
    expect(limiter.hit('user:u1', 120, 30_000)).toBe(0);
    // A new minute starts over
    expect(limiter.hit('token:t1', 120, 61_000)).toBe(0);
  });
});

describe('isImageRequest', () => {
  it('knows the image routes', () => {
    for (const path of ['/photos/3/thumbnail', '/photos/3/preview', '/cache/thumbnail/abc', '/raw/3', '/people/aa/avatar', '/photos/3/face']) {
      expect(isImageRequest('GET', path), path).toBe(true);
    }
    expect(isImageRequest('POST', '/photos/3/preview')).toBe(false);
    expect(isImageRequest('GET', '/photos')).toBe(false);
  });
});

describe('request rate quota', () => {
  it('limits a token, without blocking the browser, and does not count images', async () => {
    const browser = new TestClient(app.base);
    await browser.post('/auth/login/password', { username: 'ben', password: 'correct horse battery' });
    const created = await browser.post('/auth/tokens', { name: 'script', permissions: ['library.view'] });
    const script = new TestClient(app.base, created.body.value);

    for (let i = 0; i < 5; i++) expect((await script.get('/photos')).status).toBe(200);
    const over = await script.get('/photos');
    expect([over.status, over.body.code]).toEqual([429, 'rate_limited']);
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(over.body.params.seconds).toBe(Number(over.headers.get('retry-after')));

    expect((await browser.get('/photos')).status).toBe(200);
    // Images do not count: these get 404 (no such photo), not 429
    for (let i = 0; i < 20; i++) expect((await browser.get('/photos/999/thumbnail')).status).toBe(404);
    expect((await browser.get('/photos')).status).toBe(200);
  });
});
