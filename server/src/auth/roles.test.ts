import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openTestDatabase } from './testing.js';

let cleanup: () => void;
let roles: typeof import('./roles.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_roles_test_'));
  roles = await import('./roles.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

afterAll(() => cleanup());

const noCheck = async () => {};
const status = (err: unknown) => (err as { status?: number }).status;
const code = (err: unknown) => (err as { body?: { code?: string } }).body?.code;

describe('built-in roles', () => {
  it('lists admin, editor and viewer first with their permissions', async () => {
    const list = await roles.listRoles();
    expect(list.slice(0, 3).map((r) => [r.id, r.builtIn, r.permissions])).toEqual([
      ['admin', true, ['library.view', 'photos.edit', 'albums.manage', 'people.manage', 'export', 'account.tokens', 'plugins.manage', 'users.manage']],
      ['editor', true, ['library.view', 'photos.edit', 'albums.manage', 'people.manage', 'export', 'account.tokens']],
      ['viewer', true, ['library.view']],
    ]);
  });

  it('names them in the requested language', async () => {
    expect((await roles.getRole('viewer', 'uk'))?.name).toBe('Глядач');
    expect((await roles.getRole('viewer', 'xx'))?.name).toBe('Viewer');
  });

  it('refuses to change or delete them', async () => {
    const changed = await roles.updateRole('editor', { name: 'X' }, noCheck).catch((err) => err);
    expect([status(changed), code(changed)]).toEqual([409, 'role_builtin']);
    const deleted = await roles.deleteRole('viewer').catch((err) => err);
    expect([status(deleted), code(deleted)]).toEqual([409, 'role_builtin']);
  });
});

describe('custom roles', () => {
  it('creates, changes and deletes a role', async () => {
    const family = await roles.createRole({ name: 'Family', description: 'Close family', permissions: ['albums.manage', 'library.view', 'photos.edit'] });
    expect(family).toMatchObject({ name: 'Family', builtIn: false, permissions: ['library.view', 'photos.edit', 'albums.manage'] });
    expect(await roles.rolePermissionsOf(family.id)).toEqual(['library.view', 'photos.edit', 'albums.manage']);

    const changed = await roles.updateRole(family.id, { permissions: ['library.view'] }, noCheck);
    expect(changed.permissions).toEqual(['library.view']);
    expect(changed.name).toBe('Family');

    await roles.deleteRole(family.id);
    expect(await roles.getRole(family.id)).toBeUndefined();
  });

  it('refuses names already taken, ignoring case, also by built-in roles', async () => {
    const guests = await roles.createRole({ name: 'Guests', permissions: ['library.view'] });
    for (const name of ['guests', 'Viewer', 'admin']) {
      const err = await roles.createRole({ name, permissions: [] }).catch((e) => e);
      expect([status(err), code(err)], name).toEqual([409, 'role_name_taken']);
    }
    // Renaming to its own name is fine
    expect((await roles.updateRole(guests.id, { name: 'GUESTS' }, noCheck)).name).toBe('GUESTS');
  });

  it('refuses invalid fields', async () => {
    for (const body of [{ name: '', permissions: [] }, { name: 'A', permissions: ['photos.fly'] }, { name: 'A' }, null]) {
      const err = await roles.createRole(body).catch((e) => e);
      expect(status(err), JSON.stringify(body)).toBe(400);
    }
  });

  it('refuses to delete a role in use, naming how many users have it', async () => {
    const role = await roles.createRole({ name: 'Busy', permissions: ['library.view'] });
    db.insert(schema.users).values({ id: 'u1', username: 'ben', usernameKey: 'ben', displayName: 'Ben', roleId: role.id, createdAt: '' }).run();
    const err = await roles.deleteRole(role.id).catch((e) => e);
    expect([status(err), code(err), err.body.params.users]).toEqual([409, 'role_in_use', 1]);
    expect((await roles.listRoles()).find((r) => r.id === role.id)?.userCount).toBe(1);
  });

  it('ignores unknown stored permissions', async () => {
    const role = await roles.createRole({ name: 'Old', permissions: ['library.view'] });
    db.insert(schema.rolePermissions).values({ roleId: role.id, permission: 'photos.fly' }).run();
    expect(await roles.rolePermissionsOf(role.id)).toEqual(['library.view']);
  });

  it('rolls a change back when the administrator check throws', async () => {
    const role = await roles.createRole({ name: 'Keepers', permissions: ['users.manage'] });
    const err = await roles.updateRole(role.id, { permissions: [] }, async () => { throw new Error('no admins'); }).catch((e) => e);
    expect(err.message).toBe('no admins');
    expect(await roles.rolePermissionsOf(role.id)).toEqual(['users.manage']);
  });
});
