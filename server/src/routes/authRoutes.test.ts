import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';

// The whole app with PALOMA_AUTH=on and the real bundled auth plugins
let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let users: typeof import('../auth/users.js');
let tokens: typeof import('../auth/tokens.js');
let setup: typeof import('../auth/setup.js');

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_auth_routes_test_', { PALOMA_AUTH: 'on', PALOMA_CLIENT_ORIGIN: 'http://client.test' }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  app = await startTestApp();
  users = await import('../auth/users.js');
  tokens = await import('../auth/tokens.js');
  setup = await import('../auth/setup.js');
});

afterAll(async () => {
  await app.close();
  vi.restoreAllMocks();
  cleanup();
});

const client = () => new TestClient(app.base);

describe('before the first administrator exists', () => {
  it('reports that setup is pending and offers the password form', async () => {
    const { status, body } = await client().get('/auth/status?lang=uk');
    expect(status).toBe(200);
    expect(body).toMatchObject({ mode: 'on', setupPending: true, providers: [{ id: 'password', kind: 'credentials', label: 'Пароль' }] });
  });

  it('answers every other request with 401 and no data, including images', async () => {
    for (const url of ['/photos', '/folders', '/albums', '/photos/1/thumbnail', '/cache/thumbnail/abc', '/raw/1', '/auth/me']) {
      const { status, body } = await client().get(url);
      expect([status, body?.code], url).toEqual([401, 'unauthenticated']);
    }
  });

  it('refuses a wrong setup code', async () => {
    await setup.prepareSetup(() => {});
    const { status, body } = await client().post('/auth/setup', { setupCode: 'WRONG', username: 'anna', password: 'correct horse battery' });
    expect([status, body.code]).toEqual([400, 'setup_code_wrong']);
    expect(await users.countUsers()).toBe(0);
  });

  it('creates the first administrator with the logged setup code and logs them in', async () => {
    let logged = '';
    const code = (await setup.prepareSetup((message) => { logged = message; }))!;
    expect(logged === '' || logged.includes(code)).toBe(true);

    const anna = client();
    const { status, body, headers } = await anna.post('/auth/setup', {
      setupCode: code.toLowerCase(), username: 'anna', displayName: 'Anna', password: 'correct horse battery',
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ mode: 'on', via: 'session', user: { username: 'anna', roleId: 'admin', roleName: 'Administrator', mustChangePassword: false } });
    expect(body.permissions).toContain('users.manage');
    const cookie = headers.get('set-cookie')!;
    expect(cookie).toMatch(/^paloma_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    expect((await anna.get('/auth/me')).body.user.username).toBe('anna');
    expect((await client().get('/auth/status')).body.setupPending).toBe(false);
  });

  it('refuses setup once a user exists', async () => {
    const { status, body } = await client().post('/auth/setup', { setupCode: 'X', username: 'mallory', password: 'correct horse battery' });
    expect([status, body.code]).toEqual([409, 'setup_done']);
    expect(await users.findUserByUsername('mallory')).toBeUndefined();
  });
});

describe('login', () => {
  beforeAll(async () => {
    await users.createUser({ username: 'ben', roleId: 'viewer', password: 'correct horse battery' });
    const dan = await users.createUser({ username: 'dan', roleId: 'viewer', password: 'correct horse battery' });
    await users.updateUser(null, dan.id, { enabled: false });
  });

  it('logs in with a password, ignoring the case of the username', async () => {
    const ben = client();
    const { status, body } = await ben.post('/auth/login/password', { username: 'Ben', password: 'correct horse battery' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ user: { username: 'ben', roleId: 'viewer', mustChangePassword: true }, permissions: ['library.view'] });
    expect((await ben.get('/photos')).status).toBe(200);
    expect((await users.findUserByUsername('ben'))!.lastLoginAt).not.toBeNull();
  });

  it('answers the same for an unknown user, a wrong password and a disabled user', async () => {
    const answers = await Promise.all([
      client().post('/auth/login/password', { username: 'nobody', password: 'correct horse battery' }),
      client().post('/auth/login/password', { username: 'ben', password: 'wrong horse battery' }),
      client().post('/auth/login/password', { username: 'dan', password: 'correct horse battery' }),
    ]);
    for (const answer of answers) {
      expect(answer.status).toBe(401);
      expect(answer.body).toEqual(answers[0].body);
      expect(answer.headers.get('set-cookie')).toBeNull();
    }
    expect(answers[0].body.code).toBe('login_failed');
  });

  it('refuses logins for 15 minutes after 10 failures, even with the right password', async () => {
    await users.createUser({ username: 'eve', roleId: 'viewer', password: 'correct horse battery' });
    for (let i = 0; i < 10; i++) {
      expect((await client().post('/auth/login/password', { username: 'eve', password: `wrong ${i} battery` })).status).toBe(401);
    }
    const { status, body, headers } = await client().post('/auth/login/password', { username: 'eve', password: 'correct horse battery' });
    expect([status, body.code]).toEqual([429, 'login_throttled']);
    expect(body.params.seconds).toBeGreaterThan(890);
    expect(headers.get('retry-after')).toBe(String(body.params.seconds));
  });

  it('answers 404 for an unknown provider', async () => {
    expect((await client().post('/auth/login/oidc', {})).body.code).toBe('provider_not_found');
  });
});

describe('sessions', () => {
  const login = async (username: string, password = 'correct horse battery', headers: Record<string, string> = {}) => {
    const c = client();
    const res = await c.send('POST', '/auth/login/password', { username, password }, headers);
    expect(res.status).toBe(200);
    return c;
  };

  it('logs out only the current session', async () => {
    await users.createUser({ username: 'fay', roleId: 'viewer', password: 'correct horse battery' });
    const laptop = await login('fay');
    const phone = await login('fay');
    expect((await laptop.post('/auth/logout')).status).toBe(200);
    expect(laptop.cookie).toBeNull();
    expect((await laptop.get('/photos')).status).toBe(401);
    expect((await phone.get('/photos')).status).toBe(200);
  });

  it('lists the own sessions and revokes one', async () => {
    await users.createUser({ username: 'gus', roleId: 'viewer', password: 'correct horse battery' });
    const laptop = await login('gus', undefined, { 'User-Agent': 'Laptop' });
    const phone = await login('gus', undefined, { 'User-Agent': 'Phone' });
    const { body } = await laptop.get('/auth/sessions');
    expect(body.map((s: { userAgent: string; current: boolean }) => [s.userAgent, s.current]).sort()).toEqual([['Laptop', true], ['Phone', false]]);

    const phoneSession = body.find((s: { current: boolean }) => !s.current);
    expect((await laptop.delete(`/auth/sessions/${phoneSession.id}`)).status).toBe(200);
    expect((await phone.get('/photos')).status).toBe(401);
    expect((await laptop.get('/photos')).status).toBe(200);
    // Another user's session cannot be revoked
    const other = await login('fay');
    const fays = (await other.get('/auth/sessions')).body[0];
    expect((await laptop.delete(`/auth/sessions/${fays.id}`)).status).toBe(404);
  });

  it('changes the password, ending the other sessions', async () => {
    await users.createUser({ username: 'hal', roleId: 'viewer', password: 'correct horse battery' });
    const laptop = await login('hal');
    const phone = await login('hal');
    const wrong = await laptop.post('/auth/password', { currentPassword: 'wrong horse battery', newPassword: 'new horse battery' });
    expect([wrong.status, wrong.body.code]).toEqual([400, 'password_wrong']);
    const short = await laptop.post('/auth/password', { currentPassword: 'correct horse battery', newPassword: 'short' });
    expect([short.status, short.body.code]).toEqual([400, 'password_too_short']);

    expect((await laptop.post('/auth/password', { currentPassword: 'correct horse battery', newPassword: 'new horse battery' })).status).toBe(200);
    expect((await phone.get('/photos')).status).toBe(401);
    expect((await laptop.get('/auth/me')).body.user.mustChangePassword).toBe(false);
    await login('hal', 'new horse battery');
  });

  it('asks for a new password after an administrator reset it', async () => {
    const ivy = await users.createUser({ username: 'ivy', roleId: 'viewer', password: 'correct horse battery' });
    await users.clearMustChangePassword(ivy.id);
    await users.resetPassword(ivy.id, { password: 'given horse battery' });
    const c = await login('ivy', 'given horse battery');
    expect((await c.get('/auth/me')).body.user.mustChangePassword).toBe(true);
  });

  it('changes the own display name', async () => {
    const c = await login('ben');
    expect((await c.patch('/auth/me', { displayName: 'Ben K.' })).body.user.displayName).toBe('Ben K.');
  });
});

describe('API tokens on session-only routes', () => {
  it('cannot create tokens, change the password or manage sessions', async () => {
    const anna = (await users.findUserByUsername('anna'))!;
    const created = await tokens.createToken(anna.id, new Set(['library.view', 'account.tokens']), { name: 'script', permissions: ['library.view', 'account.tokens'] });
    const script = new TestClient(app.base, created.value);
    expect((await script.get('/photos')).status).toBe(200);
    expect((await script.get('/auth/me')).body.via).toBe('token');
    for (const [method, url] of [['POST', '/auth/tokens'], ['POST', '/auth/password'], ['GET', '/auth/sessions'], ['POST', '/auth/logout']]) {
      const { status, body } = await script.send(method, url, method === 'GET' ? undefined : {});
      expect([status, body.code], url).toEqual([403, 'session_required']);
    }
  });

  it('gets 401 with an invalid bearer credential, without falling back to the cookie', async () => {
    const c = client();
    await c.post('/auth/login/password', { username: 'ben', password: 'correct horse battery' });
    const { status } = await c.send('GET', '/photos', undefined, { Authorization: 'Bearer pal_nope' });
    expect(status).toBe(401);
  });
});

describe('permissions', () => {
  it('refuses a viewer what needs another permission, naming it', async () => {
    const ben = client();
    await ben.post('/auth/login/password', { username: 'ben', password: 'correct horse battery' });
    const { status, body } = await ben.patch('/photos/1/star', { isStarred: true });
    expect([status, body.code, body.params.permission]).toEqual([403, 'permission_required', 'photos.edit']);
    expect((await ben.patch('/plugins/basic-effects', { enabled: false })).body.params.permission).toBe('plugins.manage');
  });
});

describe('plugins with auth on', () => {
  it('keeps the last login provider on', async () => {
    const anna = client();
    await anna.post('/auth/login/password', { username: 'anna', password: 'correct horse battery' });
    const { status, body } = await anna.patch('/plugins/auth-password', { enabled: false });
    expect([status, body.code]).toEqual([409, 'last_login_provider']);
    expect((await anna.get('/plugins')).body.find((p: { id: string }) => p.id === 'auth-password').enabled).toBe(true);
    // A plugin without a login form can be switched off and on
    expect((await anna.patch('/plugins/auth-token', { enabled: false })).status).toBe(200);
    expect((await anna.patch('/plugins/auth-token', { enabled: true })).status).toBe(200);
  });
});

describe('cross-origin requests', () => {
  it('allows credentials only from the client origin', async () => {
    const allowed = await client().send('GET', '/auth/status', undefined, { Origin: 'http://client.test' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://client.test');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    const other = await client().send('GET', '/auth/status', undefined, { Origin: 'http://evil.test' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
