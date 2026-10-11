import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openTestDatabase } from './testing.js';

let cleanup: () => void;
let principal: typeof import('./principal.js');
let users: typeof import('./users.js');

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_principal_test_'));
  principal = await import('./principal.js');
  users = await import('./users.js');
  (await import('./credentials.js')).setPasswordBackend({ set: async () => {}, verify: async () => false });
});

afterAll(() => cleanup());

describe('OFF_PRINCIPAL', () => {
  it('has every permission and the whole library', () => {
    expect([...principal.OFF_PRINCIPAL.permissions]).toHaveLength(8);
    expect(principal.OFF_PRINCIPAL).toMatchObject({ user: null, access: { all: true }, via: 'off' });
  });
});

describe('principalFor', () => {
  it('gives a user their role permissions and stored access', async () => {
    const ben = await users.createUser({ username: 'ben', roleId: 'editor', password: 'correct horse', access: { all: false, albums: ['trip'] } });
    const result = (await principal.principalFor(ben.id, { via: 'session', sessionId: 's1' }))!;
    expect([...result.permissions]).toEqual(['library.view', 'photos.edit', 'albums.manage', 'people.manage', 'export', 'account.tokens']);
    expect(result).toMatchObject({ via: 'session', sessionId: 's1', access: { all: false, folders: [], albums: ['trip'] } });
  });

  it('gives a token only the permissions both it and the role have', async () => {
    const carol = await users.createUser({ username: 'carol', roleId: 'viewer', password: 'correct horse' });
    const result = (await principal.principalFor(carol.id, { via: 'token', tokenId: 't1', tokenPermissions: ['library.view', 'export'] }))!;
    expect([...result.permissions]).toEqual(['library.view']);
    expect(result.tokenId).toBe('t1');
  });

  it('always gives administrators the whole library', async () => {
    const anna = await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse', access: { all: false, albums: ['trip'] } });
    expect((await principal.principalFor(anna.id, { via: 'session' }))!.access).toEqual({ all: true });
  });

  it('is null for a disabled or unknown user', async () => {
    const dan = await users.createUser({ username: 'dan', roleId: 'viewer', password: 'correct horse', enabled: false });
    expect(await principal.principalFor(dan.id, { via: 'session' })).toBeNull();
    expect(await principal.principalFor('nobody', { via: 'session' })).toBeNull();
  });
});
