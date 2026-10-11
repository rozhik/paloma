import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase } from './testing.js';

// Uses the real bundled auth-password and auth-token plugins from the repo's plugins/ folder
let tmpDir: string;
let cleanup: () => void;
let providers: typeof import('./providers.js');
let users: typeof import('./users.js');
let tokens: typeof import('./tokens.js');
let credentials: typeof import('./credentials.js');
let registry: typeof import('../plugins/index.js').pluginRegistry;

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_providers_test_'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  providers = await import('./providers.js');
  users = await import('./users.js');
  tokens = await import('./tokens.js');
  credentials = await import('./credentials.js');
  ({ pluginRegistry: registry } = await import('../plugins/index.js'));
});

afterAll(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('auth-password', () => {
  it('offers a username and password form', async () => {
    expect(await providers.loginProviderInfos('uk')).toEqual([{
      id: 'password', kind: 'credentials', label: 'Пароль',
      fields: [{ name: 'username', label: 'Імʼя користувача', type: 'text' }, { name: 'password', label: 'Пароль', type: 'password' }],
    }]);
  });

  it('logs in with the right password, ignoring the case of the username', async () => {
    const anna = await users.createUser({ username: 'anna', roleId: 'admin', password: 'correct horse battery' });
    expect(await providers.loginWith('password', { username: 'anna', password: 'correct horse battery' })).toBe(anna.id);
    expect(await providers.loginWith('password', { username: 'Anna', password: 'correct horse battery' })).toBe(anna.id);
    expect(await providers.loginWith('password', { username: 'anna', password: 'wrong horse battery' })).toBeNull();
  });

  it('fails the same way for an unknown user, a disabled user and a missing field', async () => {
    const ben = await users.createUser({ username: 'ben', roleId: 'viewer', password: 'correct horse battery', enabled: false });
    expect(await providers.loginWith('password', { username: 'nobody', password: 'correct horse battery' })).toBeNull();
    expect(await providers.loginWith('password', { username: 'ben', password: 'correct horse battery' })).toBeNull();
    expect(await providers.loginWith('password', { username: 'anna' })).toBeNull();
    expect(ben.enabled).toBe(false);
  });

  it('changes and checks passwords for core', async () => {
    const anna = (await users.findUserByUsername('anna'))!;
    expect(await credentials.verifyPassword(anna.id, 'correct horse battery')).toBe(true);
    await credentials.setPassword(anna.id, 'new horse battery');
    expect(await credentials.verifyPassword(anna.id, 'correct horse battery')).toBe(false);
    expect(await providers.loginWith('password', { username: 'anna', password: 'new horse battery' })).toBe(anna.id);
  });

  it('never stores the password as readable text', () => {
    const database = fs.readFileSync(path.join(tmpDir, 'data', 'paloma.db'));
    const wal = fs.existsSync(path.join(tmpDir, 'data', 'paloma.db-wal')) ? fs.readFileSync(path.join(tmpDir, 'data', 'paloma.db-wal')) : Buffer.alloc(0);
    for (const file of [database, wal]) {
      expect(file.includes('correct horse battery')).toBe(false);
      expect(file.includes('new horse battery')).toBe(false);
    }
  });

  it('answers 404 for an unknown provider', async () => {
    await expect(providers.loginWith('oidc', {})).rejects.toMatchObject({ status: 404, body: { code: 'provider_not_found' } });
  });
});

describe('auth-token', () => {
  it('resolves a valid token to its owner and permissions', async () => {
    const anna = (await users.findUserByUsername('anna'))!;
    const created = await tokens.createToken(anna.id, new Set(['library.view', 'export']), { name: 'frame', permissions: ['library.view'] });
    expect(created.value).toMatch(/^pal_/);
    expect(await providers.authenticateBearer(created.value)).toEqual({ userId: anna.id, tokenId: created.id, permissions: ['library.view'] });
    expect(await providers.authenticateBearer('pal_unknown')).toBeNull();
    expect(await providers.authenticateBearer('not-a-token')).toBeNull();
  });

  it('rejects a token of a disabled owner', async () => {
    const carol = await users.createUser({ username: 'carol', roleId: 'viewer', password: 'correct horse battery' });
    const created = await tokens.createToken(carol.id, new Set(['library.view']), { name: 'x', permissions: ['library.view'] });
    await users.updateUser(null, carol.id, { enabled: false });
    expect(await providers.authenticateBearer(created.value)).toBeNull();
  });

  it('stops every token while the plugin is off and accepts them again when it is on', async () => {
    const anna = (await users.findUserByUsername('anna'))!;
    const created = await tokens.createToken(anna.id, new Set(['library.view']), { name: 'switch', permissions: ['library.view'] });
    await registry.setEnabled('auth-token', false);
    expect(await providers.authenticateBearer(created.value)).toBeNull();
    await registry.setEnabled('auth-token', true);
    expect(await providers.authenticateBearer(created.value)).toMatchObject({ userId: anna.id });
  });
});
