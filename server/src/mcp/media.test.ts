import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openTestDatabase } from '../auth/testing.js';

// Signing and checking temporary links; fetching them end to end is in tools.test.ts ("image links").

let cleanup: () => void;
let media: typeof import('./media.js');

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_mcp_media_test_'));
  media = await import('./media.js');
});

afterAll(() => cleanup());

const NOW = 1_800_000_000_000;
const payload = (values: Partial<import('./media.js').LinkPayload> = {}) => ({ p: 7, k: 'thumb' as const, r: null, t: 'tok', e: NOW + 300_000, ...values });

describe('temporary links', () => {
  it('verify while valid and carry no path', () => {
    const link = media.signLink(payload({ r: 'abc123' }));
    expect(link).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(media.verifyLink(link, NOW)).toEqual(payload({ r: 'abc123' }));
    expect(media.verifyLink(media.signLink(payload({ k: 800 })), NOW)?.k).toBe(800);
  });

  it('expire at their time', () => {
    const link = media.signLink(payload());
    expect(media.verifyLink(link, NOW + 299_999)).not.toBeNull();
    expect(media.verifyLink(link, NOW + 300_000)).toBeNull();
    expect(media.verifyLink(link, NOW + 301_000)).toBeNull();
  });

  it('refuse a changed payload, a changed signature and garbage', () => {
    const link = media.signLink(payload());
    const [data, signature] = link.split('.');
    const other = Buffer.from(JSON.stringify(payload({ p: 8 }))).toString('base64url');
    expect(media.verifyLink(`${other}.${signature}`, NOW)).toBeNull();
    expect(media.verifyLink(`${data}.${'A'.repeat(43)}`, NOW)).toBeNull();
    for (const bad of ['', '.', 'abc', `${data}.`, `${data}.${signature}x`, '../../etc/passwd']) expect(media.verifyLink(bad, NOW)).toBeNull();
  });

  it('refuse a signed payload of the wrong shape', () => {
    for (const values of [{ k: 'raw' }, { k: 10 }, { k: 5000 }, { p: 'x' }, { e: 'later' }, { t: 5 }] as never[]) {
      expect(media.verifyLink(media.signLink(payload(values)), NOW)).toBeNull();
    }
  });
});
