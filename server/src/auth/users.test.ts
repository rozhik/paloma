import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase } from './testing.js';

let tmpDir: string;
let cleanup: () => void;
let users: typeof import('./users.js');
let roles: typeof import('./roles.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
const passwords = new Map<string, string>();

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_users_test_'));
  users = await import('./users.js');
  roles = await import('./roles.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  (await import('./credentials.js')).setPasswordBackend({
    set: async (id, password) => { passwords.set(id, password); },
    verify: async (id, password) => passwords.get(id) === password,
  });
});

afterAll(() => cleanup());

const failure = async (promise: Promise<unknown>) => {
  const err = await promise.then(() => null, (e) => e);
  return err && [err.status, err.body?.code];
};

let n = 0;
const create = (fields: Record<string, unknown> = {}) =>
  users.createUser({ username: `user${n++}`, roleId: 'viewer', password: 'correct horse', ...fields });

describe('createUser', () => {
  it('creates a user who must choose their own password', async () => {
    const anna = await users.createUser({ username: 'anna', displayName: 'Anna K.', roleId: 'admin', password: 'correct horse battery' });
    expect(anna).toMatchObject({
      username: 'anna', displayName: 'Anna K.', roleId: 'admin', enabled: true, mustChangePassword: true, access: { all: true }, lastLoginAt: null,
    });
    expect(passwords.get(anna.id)).toBe('correct horse battery');
    expect(anna.quotas).toEqual([
      { kind: 'export_bytes', limit: null, effectiveLimit: null, used: 0 },
      { kind: 'requests_per_minute', limit: null, effectiveLimit: 600 },
    ]);
  });

  it('refuses a username taken in another case', async () => {
    expect(await failure(users.createUser({ username: 'Anna', roleId: 'viewer', password: 'correct horse' }))).toEqual([409, 'username_taken']);
  });

  it('refuses invalid usernames', async () => {
    for (const username of ['a b', 'ab', 'x'.repeat(33), '...', '../x', '']) {
      expect(await failure(create({ username })), username).toEqual([400, 'username_invalid']);
    }
    expect((await create({ username: 'олена_1.k' })).username).toBe('олена_1.k');
  });

  it('refuses a short password and an unknown role without storing a user', async () => {
    expect(await failure(create({ username: 'shorty', password: '1234567' }))).toEqual([400, 'password_too_short']);
    expect(await failure(create({ username: 'norole', roleId: 'boss' }))).toEqual([400, 'role_not_found']);
    expect(await users.findUserByUsername('shorty')).toBeUndefined();
    expect(await users.findUserByUsername('norole')).toBeUndefined();
  });

  it('stores limited access and quotas', async () => {
    const ben = await create({
      username: 'ben', access: { all: false, folders: ['/photos/2024/', '/photos/2024'], albums: ['c9ea'] }, quotas: { export_bytes: 500 },
    });
    expect(ben.access).toEqual({ all: false, folders: ['/photos/2024'], albums: ['c9ea'] });
    expect(ben.quotas[0]).toMatchObject({ kind: 'export_bytes', limit: 500 });
  });

  it('reports the export space a user uses', async () => {
    const carol = await create({ username: 'carol' });
    fs.mkdirSync(path.join(tmpDir, 'export', 'carol', 'trip'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'export', 'carol', 'trip', 'a.jpg'), Buffer.alloc(1500));
    fs.writeFileSync(path.join(tmpDir, 'export', 'carol', 'b.jpg'), Buffer.alloc(500));
    expect((await users.userInfo((await users.findUserById(carol.id))!)).quotas[0].used).toBe(2000);
  });

  it('refuses invalid access and quotas', async () => {
    expect(await failure(create({ access: { all: false, folders: ['relative'] } }))).toEqual([400, 'invalid_field']);
    expect(await failure(create({ quotas: { export_bytes: -1 } }))).toEqual([400, 'invalid_field']);
    expect(await failure(create({ quotas: { uploads: 1 } }))).toEqual([400, 'invalid_field']);
  });
});

describe('updateUser', () => {
  it('changes display name, role, access and quotas', async () => {
    const user = await create();
    const changed = await users.updateUser('someone', user.id, {
      displayName: 'Ben K.', roleId: 'editor', access: { all: false, albums: ['trip'] }, quotas: { requests_per_minute: 120 },
    });
    expect(changed).toMatchObject({ displayName: 'Ben K.', roleId: 'editor', access: { all: false, folders: [], albums: ['trip'] } });
    expect(changed.quotas[1]).toEqual({ kind: 'requests_per_minute', limit: 120, effectiveLimit: 120 });
  });

  it('refuses changing the username', async () => {
    const user = await create();
    expect(await failure(users.updateUser(null, user.id, { username: 'other' }))).toEqual([400, 'invalid_field']);
  });

  it('ends the sessions of a disabled user, also after enabling them again', async () => {
    const user = await create();
    db.insert(schema.sessions).values({ id: 's-dis', tokenHash: 'h-dis', userId: user.id, createdAt: '', lastUsedAt: '' }).run();
    expect((await users.updateUser('admin', user.id, { enabled: false })).enabled).toBe(false);
    expect((await users.updateUser('admin', user.id, { enabled: true })).enabled).toBe(true);
    expect(db.select().from(schema.sessions).all().filter((s) => s.userId === user.id)).toEqual([]);
  });

  it('refuses disabling oneself', async () => {
    const user = await create();
    expect(await failure(users.updateUser(user.id, user.id, { enabled: false }))).toEqual([409, 'self_change']);
  });

  it('answers 404 for an unknown user', async () => {
    expect(await failure(users.updateUser(null, 'nobody', { displayName: 'X' }))).toEqual([404, 'user_not_found']);
  });
});

describe('the last administrator', () => {
  it('cannot lose the administrator role, be disabled or be deleted', async () => {
    const anna = (await users.findUserByUsername('anna'))!;
    expect(await failure(users.updateUser(anna.id, anna.id, { roleId: 'editor' }))).toEqual([409, 'last_admin']);
    expect(await failure(users.updateUser('other', anna.id, { enabled: false }))).toEqual([409, 'last_admin']);
    expect(await failure(users.deleteUser('other', anna.id))).toEqual([409, 'last_admin']);
    expect((await users.findUserById(anna.id))).toMatchObject({ roleId: 'admin', enabled: true });
  });

  it('counts users of custom roles with users.manage', async () => {
    const anna = (await users.findUserByUsername('anna'))!;
    const keepers = await roles.createRole({ name: 'Keepers', permissions: ['library.view', 'users.manage'] });
    const dan = await create({ username: 'dan', roleId: keepers.id });
    // Dan keeps the instance administered, so Anna may step down
    await users.updateUser(anna.id, anna.id, { roleId: 'editor' });
    // Taking users.manage away from Dan's role would leave nobody
    expect(await failure(roles.updateRole(keepers.id, { permissions: ['library.view'] }, users.ensureAdminRemains))).toEqual([409, 'last_admin']);
    await users.updateUser(dan.id, anna.id, { roleId: 'admin' });
  });

  it('cannot delete oneself', async () => {
    const anna = (await users.findUserByUsername('anna'))!;
    expect(await failure(users.deleteUser(anna.id, anna.id))).toEqual([409, 'self_change']);
  });
});

describe('deleteUser', () => {
  it('removes the account with its sessions and tokens and keeps the export folder', async () => {
    const eve = await create({ username: 'eve' });
    db.insert(schema.sessions).values({ id: 's-eve', tokenHash: 'h-eve', userId: eve.id, createdAt: '', lastUsedAt: '' }).run();
    db.insert(schema.apiTokens).values({ id: 't-eve', userId: eve.id, name: 'x', tokenHash: 'th-eve', permissions: '[]', createdAt: '' }).run();
    const exportDir = path.join(tmpDir, 'export', 'eve');
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(path.join(exportDir, 'a.jpg'), 'x');

    await users.deleteUser('admin', eve.id);
    expect(await users.findUserById(eve.id)).toBeUndefined();
    expect(db.select().from(schema.sessions).all().some((s) => s.userId === eve.id)).toBe(false);
    expect(db.select().from(schema.apiTokens).all().some((t) => t.userId === eve.id)).toBe(false);
    expect(fs.existsSync(path.join(exportDir, 'a.jpg'))).toBe(true);
  });
});

describe('resetPassword', () => {
  it('sets the password, ends the sessions and asks for a new password', async () => {
    const user = await create();
    await users.clearMustChangePassword(user.id);
    db.insert(schema.sessions).values({ id: 's-reset', tokenHash: 'h-reset', userId: user.id, createdAt: '', lastUsedAt: '' }).run();
    const reset = await users.resetPassword(user.id, { password: 'new horse battery' });
    expect(reset.mustChangePassword).toBe(true);
    expect(passwords.get(user.id)).toBe('new horse battery');
    expect(db.select().from(schema.sessions).all().some((s) => s.userId === user.id)).toBe(false);
  });

  it('refuses a short password', async () => {
    const user = await create();
    expect(await failure(users.resetPassword(user.id, { password: 'short' }))).toEqual([400, 'password_too_short']);
  });
});

describe('updateOwnProfile', () => {
  it('changes the display name', async () => {
    const user = await create();
    expect((await users.updateOwnProfile(user.id, { displayName: ' Ben K. ' })).displayName).toBe('Ben K.');
  });
});
