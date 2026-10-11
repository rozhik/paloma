import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Permission, RoleInfo } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, get, run, withTransaction } from '../db/query.js';
import { rolePermissions, roles, users } from '../db/schema.js';
import { fail } from '../services/apiError.js';
import { BUILT_IN_ROLES, builtInRole, isPermission, knownPermissions } from './permissions.js';
import { builtInRoleText } from './texts.js';

const MAX_NAME = 64;
const MAX_DESCRIPTION = 500;

function builtInInfo(id: string, lang: string): RoleInfo | undefined {
  const role = builtInRole(id);
  if (!role) return undefined;
  const text = builtInRoleText(role.id, lang);
  return { id: role.id, name: text.name, description: text.description, builtIn: true, permissions: [...role.permissions] };
}

async function customRoles(): Promise<RoleInfo[]> {
  const rows = await all(db.select().from(roles).orderBy(roles.nameKey));
  const granted = await all(db.select().from(rolePermissions));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    builtIn: false,
    permissions: knownPermissions(granted.filter((g) => g.roleId === row.id).map((g) => g.permission)),
  }));
}

/** A role by id, built-in or custom, with texts in `lang`. */
export async function getRole(id: string, lang = 'en'): Promise<RoleInfo | undefined> {
  const builtIn = builtInInfo(id, lang);
  if (builtIn) return builtIn;
  return (await customRoles()).find((role) => role.id === id);
}

/** The permissions of a role; none for an unknown role. Unknown stored permissions are ignored. */
export async function rolePermissionsOf(roleId: string): Promise<Permission[]> {
  const builtIn = builtInRole(roleId);
  if (builtIn) return [...builtIn.permissions];
  const rows = await all(db.select({ permission: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, roleId)));
  return knownPermissions(rows.map((row) => row.permission));
}

/** Every role, built-in first, with the number of users that have it. */
export async function listRoles(lang = 'en'): Promise<RoleInfo[]> {
  const counts = new Map((await all(db.select({ roleId: users.roleId, n: sql<number>`count(*)` }).from(users).groupBy(users.roleId)))
    .map((row) => [row.roleId, row.n]));
  const list = [...BUILT_IN_ROLES.map((role) => builtInInfo(role.id, lang)!), ...await customRoles()];
  return list.map((role) => ({ ...role, userCount: counts.get(role.id) ?? 0 }));
}

interface RoleFields {
  name?: string;
  description?: string;
  permissions?: Permission[];
}

/** Validates a role body; `partial` allows missing fields. Throws 400 for invalid ones. */
function roleFields(body: unknown, partial: boolean): RoleFields {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) fail(400, 'invalid_body', 'Body must be an object');
  const input = body as Record<string, unknown>;
  const fields: RoleFields = {};
  if (input.name !== undefined || !partial) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > MAX_NAME) fail(400, 'invalid_field', `name must have 1 to ${MAX_NAME} characters`, { field: 'name' });
    fields.name = name;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || input.description.length > MAX_DESCRIPTION) {
      fail(400, 'invalid_field', `description must be text of at most ${MAX_DESCRIPTION} characters`, { field: 'description' });
    }
    fields.description = input.description.trim();
  }
  if (input.permissions !== undefined || !partial) {
    if (!Array.isArray(input.permissions) || !input.permissions.every(isPermission)) {
      fail(400, 'invalid_field', 'permissions must be a list of known permissions', { field: 'permissions' });
    }
    fields.permissions = knownPermissions(input.permissions);
  }
  return fields;
}

/** Throws 409 when another role, built-in or custom, already has this name (ignoring case). */
async function checkNameFree(name: string, exceptId?: string): Promise<void> {
  const key = name.toLowerCase();
  const builtInNames = BUILT_IN_ROLES.flatMap((role) => [role.id, builtInRoleText(role.id, 'en').name.toLowerCase()]);
  const other = await get(db.select({ id: roles.id }).from(roles).where(eq(roles.nameKey, key)));
  const taken = builtInNames.includes(key) || (other !== undefined && other.id !== exceptId);
  if (taken) fail(409, 'role_name_taken', `A role named ${name} already exists`, { name });
}

async function savePermissions(roleId: string, permissions: Permission[]): Promise<void> {
  await run(db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId)));
  if (permissions.length > 0) await run(db.insert(rolePermissions).values(permissions.map((permission) => ({ roleId, permission }))));
}

export async function createRole(body: unknown, lang = 'en'): Promise<RoleInfo> {
  const fields = roleFields(body, false);
  const id = `r_${crypto.randomBytes(6).toString('hex')}`;
  await withTransaction(async () => {
    await checkNameFree(fields.name!);
    await run(db.insert(roles).values({
      id, name: fields.name!, nameKey: fields.name!.toLowerCase(), description: fields.description ?? '', createdAt: new Date().toISOString(),
    }));
    await savePermissions(id, fields.permissions!);
  });
  return (await getRole(id, lang))!;
}

/**
 * Changes a custom role. Built-in roles are refused with 409. `checkAdmins` runs inside the same transaction
 * after the change and throws to roll it back (used to keep at least one administrator).
 */
export async function updateRole(id: string, body: unknown, checkAdmins: () => Promise<void>, lang = 'en'): Promise<RoleInfo> {
  if (builtInRole(id)) fail(409, 'role_builtin', `The built-in role ${id} cannot be changed`, { id });
  const fields = roleFields(body, true);
  await withTransaction(async () => {
    const existing = await get(db.select().from(roles).where(eq(roles.id, id)));
    if (!existing) fail(404, 'role_not_found', `Role ${id} not found`, { id });
    if (fields.name !== undefined) {
      await checkNameFree(fields.name, id);
    }
    if (fields.name !== undefined || fields.description !== undefined) {
      await run(db.update(roles).set({
        ...(fields.name !== undefined ? { name: fields.name, nameKey: fields.name.toLowerCase() } : {}),
        ...(fields.description !== undefined ? { description: fields.description } : {}),
      }).where(eq(roles.id, id)));
    }
    if (fields.permissions !== undefined) await savePermissions(id, fields.permissions);
    await checkAdmins();
  });
  return (await getRole(id, lang))!;
}

/** Deletes a custom role; refused with 409 for a built-in role or one that users have. */
export async function deleteRole(id: string): Promise<void> {
  if (builtInRole(id)) fail(409, 'role_builtin', `The built-in role ${id} cannot be deleted`, { id });
  await withTransaction(async () => {
    const existing = await get(db.select().from(roles).where(eq(roles.id, id)));
    if (!existing) fail(404, 'role_not_found', `Role ${id} not found`, { id });
    const { n } = (await get(db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.roleId, id))))!;
    if (n > 0) fail(409, 'role_in_use', `${n} user(s) have the role ${existing.name}`, { users: n, name: existing.name });
    await run(db.delete(roles).where(eq(roles.id, id)));
  });
}
