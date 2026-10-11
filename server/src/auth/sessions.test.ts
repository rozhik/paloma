import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request } from 'express';
import { openTestDatabase } from './testing.js';

let cleanup: () => void;
let sessions: typeof import('./sessions.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_sessions_test_', { PALOMA_SESSION_DAYS: '30' }));
  sessions = await import('./sessions.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  for (const id of ['anna', 'ben']) {
    db.insert(schema.users).values({ id, username: id, usernameKey: id, displayName: id, roleId: 'admin', createdAt: '' }).run();
  }
});

afterAll(() => cleanup());

const day = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-10-01T12:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

describe('sessions', () => {
  it('stores only the hash of the cookie value', async () => {
    const { cookieValue } = await sessions.createSession('anna', { userAgent: 'Firefox', ip: '10.0.0.2' }, t0);
    const stored = JSON.stringify(db.select().from(schema.sessions).all());
    expect(stored).not.toContain(cookieValue);
    expect(stored).toContain(sessions.sha256(cookieValue));
  });

  it('extends a session on use and ends it after the idle lifetime', async () => {
    const { cookieValue } = await sessions.createSession('anna', {}, t0);
    expect(await sessions.useSession(cookieValue, {}, at(29 * day))).toBeDefined();
    // Used on day 29, so still valid 29 days after that
    expect(await sessions.useSession(cookieValue, {}, at(58 * day))).toBeDefined();
    expect(await sessions.useSession(cookieValue, {}, at(89 * day))).toBeUndefined();
    // Deleted once expired
    expect(await sessions.useSession(cookieValue, {}, at(58 * day))).toBeUndefined();
  });

  it('writes the last use at most once a minute', async () => {
    const { id, cookieValue } = await sessions.createSession('anna', {}, t0);
    await sessions.useSession(cookieValue, {}, at(30_000));
    expect(db.select().from(schema.sessions).all().find((s) => s.id === id)?.lastUsedAt).toBe(t0.toISOString());
    await sessions.useSession(cookieValue, { userAgent: 'Safari' }, at(61_000));
    expect(db.select().from(schema.sessions).all().find((s) => s.id === id)).toMatchObject({ lastUsedAt: at(61_000).toISOString(), userAgent: 'Safari' });
  });

  it('lists and revokes the sessions of a user, marking the current one', async () => {
    db.delete(schema.sessions).run();
    const laptop = await sessions.createSession('ben', { userAgent: 'Laptop' }, t0);
    const phone = await sessions.createSession('ben', { userAgent: 'Phone' }, at(1000));
    await sessions.createSession('anna', {}, t0);

    const list = await sessions.listSessions('ben', laptop.id, at(2000));
    expect(list.map((s) => [s.userAgent, s.current, s.username])).toEqual([['Phone', false, 'ben'], ['Laptop', true, 'ben']]);
    expect(await sessions.listSessions(null, undefined, at(2000))).toHaveLength(3);

    // Another user's session is not revoked through ben
    const annaSession = (await sessions.listSessions('anna', undefined, at(2000)))[0];
    expect(await sessions.revokeSession(annaSession.id, 'ben')).toBe(false);
    expect(await sessions.revokeSession(phone.id, 'ben')).toBe(true);
    expect(await sessions.useSession(phone.cookieValue, {}, at(3000))).toBeUndefined();
    expect(await sessions.useSession(laptop.cookieValue, {}, at(3000))).toBeDefined();
  });

  it('ends the other sessions of a user', async () => {
    db.delete(schema.sessions).run();
    const keep = await sessions.createSession('ben', {}, t0);
    const other = await sessions.createSession('ben', {}, t0);
    await sessions.endOtherSessions('ben', keep.id);
    expect(await sessions.useSession(keep.cookieValue, {}, t0)).toBeDefined();
    expect(await sessions.useSession(other.cookieValue, {}, t0)).toBeUndefined();
  });

  it('prunes idle sessions', async () => {
    db.delete(schema.sessions).run();
    await sessions.createSession('ben', {}, t0);
    await sessions.createSession('ben', {}, at(20 * day));
    expect(await sessions.pruneSessions(at(40 * day))).toBe(1);
  });
});

describe('readCookie', () => {
  it('reads one cookie from the header', () => {
    const req = { headers: { cookie: 'theme=dark; paloma_session=abc%3D; x=1' } } as unknown as Request;
    expect(sessions.readCookie(req, 'paloma_session')).toBe('abc=');
    expect(sessions.readCookie(req, 'missing')).toBeUndefined();
  });
});
