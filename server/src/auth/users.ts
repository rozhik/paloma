import crypto from 'node:crypto';
import path from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { LibraryAccess, UserInfo } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, get, run, withTransaction } from '../db/query.js';
import { folderPeople, persons, photoPeople, rolePermissions, sessions, userAccess, users } from '../db/schema.js';
import { avatarVersions, isPersonVisible, shownPeople } from '../services/people.js';
import { CONTACT_ID } from '../services/SidecarService.js';
import { fail } from '../services/apiError.js';
import { checkPassword, setPassword } from './credentials.js';
import { BUILT_IN_ROLES } from './permissions.js';
import { parseQuotaLimits, quotaInfos, setQuotaLimits } from './quotas.js';
import { getRole } from './roles.js';

export type UserRow = typeof users.$inferSelect;

const USERNAME = /^[\p{L}\p{N}._-]{3,32}$/u;
const MAX_DISPLAY_NAME = 100;

/** Throws 400 `username_invalid` unless the username has 3 to 32 letters, digits, `.`, `_` or `-`. */
export function checkUsername(value: unknown): string {
  const username = typeof value === 'string' ? value.trim() : '';
  // Only dots would be `.`/`..`-like names for the user's export folder
  if (!USERNAME.test(username) || /^\.+$/.test(username)) {
    fail(400, 'username_invalid', 'Usernames have 3 to 32 letters, digits, ".", "_" or "-"');
  }
  return username;
}

function checkDisplayName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > MAX_DISPLAY_NAME) {
    fail(400, 'invalid_field', `displayName must have 1 to ${MAX_DISPLAY_NAME} characters`, { field: 'displayName' });
  }
  return name;
}

/** Checks a `LibraryAccess` body field. Folder paths must be absolute; they are normalized without a trailing separator. */
export function parseAccess(value: unknown): LibraryAccess {
  const invalid = () => fail(400, 'invalid_field', 'access must be {"all": true} or {"all": false, "folders": [...], "albums": [...]}', { field: 'access' });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>;
  if (input.all === true) return { all: true };
  if (input.all !== false) invalid();
  const folders = input.folders ?? [];
  const albums = input.albums ?? [];
  if (!Array.isArray(folders) || !folders.every((f) => typeof f === 'string' && path.isAbsolute(f))) invalid();
  if (!Array.isArray(albums) || !albums.every((a) => typeof a === 'string' && a !== '')) invalid();
  const normalized = (folders as string[]).map((folder) => {
    const resolved = path.resolve(folder);
    return resolved.length > 1 && resolved.endsWith(path.sep) ? resolved.slice(0, -1) : resolved;
  });
  return { all: false, folders: [...new Set(normalized)], albums: [...new Set(albums as string[])] };
}

/** The stored access of a user (not widened for administrators; see principal.ts). */
export async function storedAccess(user: UserRow): Promise<LibraryAccess> {
  if (user.accessAll) return { all: true };
  const rows = await all(db.select().from(userAccess).where(eq(userAccess.userId, user.id)));
  return {
    all: false,
    folders: rows.filter((row) => row.kind === 'folder').map((row) => row.value).sort(),
    albums: rows.filter((row) => row.kind === 'album').map((row) => row.value).sort(),
  };
}

async function saveAccess(userId: string, access: LibraryAccess): Promise<void> {
  await run(db.update(users).set({ accessAll: access.all }).where(eq(users.id, userId)));
  await run(db.delete(userAccess).where(eq(userAccess.userId, userId)));
  if (access.all) return;
  const rows = [
    ...access.folders.map((value) => ({ userId, kind: 'folder' as const, value })),
    ...access.albums.map((value) => ({ userId, kind: 'album' as const, value })),
  ];
  if (rows.length > 0) await run(db.insert(userAccess).values(rows));
}

/** Adds an album to a user's limited access; nothing for a user who sees the whole library. */
export async function grantAlbum(userId: string, token: string): Promise<void> {
  await run(db.insert(userAccess).values({ userId, kind: 'album', value: token }).onConflictDoNothing());
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  return get(db.select().from(users).where(eq(users.id, id)));
}

/** The user with this username, ignoring case. */
export async function findUserByUsername(username: string): Promise<UserRow | undefined> {
  return get(db.select().from(users).where(eq(users.usernameKey, username.trim().toLowerCase())));
}

export async function countUsers(): Promise<number> {
  return (await get(db.select({ n: sql<number>`count(*)` }).from(users)))!.n;
}

/** URL of a user's uploaded avatar; null without one. */
export const uploadedAvatarUrl = (user: Pick<UserRow, 'id' | 'avatarVersion'>): string | null =>
  user.avatarVersion ? `/api/users/${encodeURIComponent(user.id)}/avatar?v=${user.avatarVersion}` : null;

/** URL of a person's face avatar for the current request; null when they have none or it may not see them. */
export async function personAvatarUrl(personId: string): Promise<string | null> {
  if (!(await isPersonVisible(personId))) return null;
  const version = (await avatarVersions(await shownPeople([personId]), personId)).get(personId) ?? null;
  return version ? `/api/people/${personId}/avatar?v=${version}` : null;
}

/** The linked person's shown name and the avatar to show: the uploaded one, else the person's face. */
export async function personAndAvatar(user: UserRow): Promise<Pick<UserInfo, 'personId' | 'personName' | 'avatarUrl'>> {
  const personName = user.personId ? (await shownPeople([user.personId])).get(user.personId)?.name ?? null : null;
  const avatarUrl = uploadedAvatarUrl(user) ?? (user.personId ? await personAvatarUrl(user.personId) : null);
  return { personId: user.personId, personName, avatarUrl };
}

/** Whether a contact id is a person of the library: one saved in Paloma, on a photo, or defined by a folder. */
async function personKnown(id: string): Promise<boolean> {
  return (await get(db.select({ id: persons.contactId }).from(persons).where(eq(persons.contactId, id)))) !== undefined
    || (await get(db.select({ id: photoPeople.contactId }).from(photoPeople).where(eq(photoPeople.contactId, id)))) !== undefined
    || (await get(db.select({ id: folderPeople.contactId }).from(folderPeople).where(eq(folderPeople.contactId, id)))) !== undefined;
}

/** Checks a `personId` body field: a known person, or null to unlink. Throws 400. */
async function checkPersonId(value: unknown): Promise<string | null> {
  if (value === null) return null;
  if (typeof value !== 'string' || !CONTACT_ID.test(value) || !(await personKnown(value))) {
    fail(400, 'invalid_field', 'personId must be a person of the library or null', { field: 'personId' });
  }
  return value;
}

/** Throws 409 `person_linked` when another user is linked with the person. Call inside the transaction. */
async function checkPersonFree(personId: string | null, userId: string): Promise<void> {
  if (personId === null) return;
  const other = await get(db.select({ id: users.id, username: users.username }).from(users).where(eq(users.personId, personId)));
  if (other && other.id !== userId) fail(409, 'person_linked', `The person is already linked with ${other.username}`, { username: other.username });
}

export async function userInfo(user: UserRow): Promise<UserInfo> {
  return {
    ...await personAndAvatar(user),
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roleId: user.roleId,
    enabled: user.enabled,
    mustChangePassword: user.mustChangePassword,
    access: await storedAccess(user),
    quotas: await quotaInfos(user.id, user.username),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function listUsers(): Promise<UserInfo[]> {
  const rows = await all(db.select().from(users).orderBy(users.usernameKey));
  return Promise.all(rows.map(userInfo));
}

async function requireUser(id: string): Promise<UserRow> {
  const user = await findUserById(id);
  if (!user) fail(404, 'user_not_found', `User ${id} not found`, { id });
  return user;
}

async function checkRole(roleId: unknown): Promise<string> {
  if (typeof roleId !== 'string' || !(await getRole(roleId))) {
    fail(400, 'role_not_found', `Role ${String(roleId)} not found`, { id: String(roleId) });
  }
  return roleId;
}

/** Ids of the roles that have `users.manage`. */
async function adminRoleIds(): Promise<string[]> {
  const builtIn = BUILT_IN_ROLES.filter((role) => role.permissions.includes('users.manage')).map((role) => role.id as string);
  const custom = await all(db.select({ roleId: rolePermissions.roleId }).from(rolePermissions)
    .where(eq(rolePermissions.permission, 'users.manage')));
  return [...builtIn, ...custom.map((row) => row.roleId)];
}

/**
 * Throws 409 `last_admin` when no enabled user has a role with `users.manage`. Called inside the transaction
 * of a change, after applying it, so throwing rolls the change back. Nothing is checked while there are no
 * users at all (before the first administrator is set up).
 */
export async function ensureAdminRemains(): Promise<void> {
  if (await countUsers() === 0) return;
  const { n } = (await get(db.select({ n: sql<number>`count(*)` }).from(users)
    .where(and(eq(users.enabled, true), inArray(users.roleId, await adminRoleIds())))))!;
  if (n === 0) fail(409, 'last_admin', 'At least one enabled administrator must remain');
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) fail(400, 'invalid_body', 'Body must be an object');
  return body as Record<string, unknown>;
}

/**
 * Creates a user with an initial password, which they must change at their first login unless
 * `mustChangePassword` is false (the first administrator chose their own).
 */
export async function createUser(body: unknown, options: { mustChangePassword?: boolean; roleId?: string } = {}): Promise<UserInfo> {
  const input = bodyObject(body);
  const username = checkUsername(input.username);
  const displayName = input.displayName === undefined ? username : checkDisplayName(input.displayName);
  const roleId = options.roleId ?? await checkRole(input.roleId);
  const access = input.access === undefined ? { all: true as const } : parseAccess(input.access);
  const quotas = input.quotas === undefined ? {} : parseQuotaLimits(input.quotas);
  const personId = input.personId === undefined ? null : await checkPersonId(input.personId);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    fail(400, 'invalid_field', 'enabled must be true or false', { field: 'enabled' });
  }
  // Checked before anything is stored, so an invalid password leaves no user behind
  checkPassword(input.password);

  const id = crypto.randomUUID();
  await withTransaction(async () => {
    if (await findUserByUsername(username)) fail(409, 'username_taken', `The username ${username} is taken`, { username });
    await checkPersonFree(personId, id);
    await run(db.insert(users).values({
      personId,
      id,
      username,
      usernameKey: username.toLowerCase(),
      displayName,
      roleId,
      enabled: input.enabled !== false,
      mustChangePassword: options.mustChangePassword ?? true,
      accessAll: true,
      createdAt: new Date().toISOString(),
    }));
    await saveAccess(id, access);
    await setQuotaLimits(id, quotas);
  });
  try {
    await setPassword(id, input.password);
  } catch (err) {
    await run(db.delete(users).where(eq(users.id, id)));
    throw err;
  }
  return userInfo((await findUserById(id))!);
}

/**
 * Changes another user's (or one's own) display name, role, enabled flag, access and quotas. Disabling ends
 * the user's sessions. Refused with 409 when it would leave no enabled administrator, or when `actorId`
 * disables themselves.
 */
export async function updateUser(actorId: string | null, id: string, body: unknown): Promise<UserInfo> {
  const input = bodyObject(body);
  if (input.username !== undefined) fail(400, 'invalid_field', 'Usernames cannot be changed', { field: 'username' });
  if (input.password !== undefined) fail(400, 'invalid_field', 'Set passwords with the password reset', { field: 'password' });
  const displayName = input.displayName === undefined ? undefined : checkDisplayName(input.displayName);
  const roleId = input.roleId === undefined ? undefined : await checkRole(input.roleId);
  const access = input.access === undefined ? undefined : parseAccess(input.access);
  const quotas = input.quotas === undefined ? undefined : parseQuotaLimits(input.quotas);
  const personId = input.personId === undefined ? undefined : await checkPersonId(input.personId);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    fail(400, 'invalid_field', 'enabled must be true or false', { field: 'enabled' });
  }
  const enabled = input.enabled as boolean | undefined;
  if (enabled === false && actorId === id) fail(409, 'self_change', 'You cannot disable your own account');

  await withTransaction(async () => {
    const user = await requireUser(id);
    const changes: Partial<UserRow> = {};
    if (displayName !== undefined) changes.displayName = displayName;
    if (roleId !== undefined) changes.roleId = roleId;
    if (enabled !== undefined) changes.enabled = enabled;
    if (personId !== undefined) {
      await checkPersonFree(personId, id);
      changes.personId = personId;
    }
    if (Object.keys(changes).length > 0) await run(db.update(users).set(changes).where(eq(users.id, id)));
    if (access !== undefined) await saveAccess(id, access);
    if (quotas !== undefined) await setQuotaLimits(id, quotas);
    // Old sessions never come back, also when the user is enabled again
    if (enabled === false && user.enabled) await run(db.delete(sessions).where(eq(sessions.userId, id)));
    await ensureAdminRemains();
  });
  return userInfo((await findUserById(id))!);
}

/** A user changes their own display name. */
export async function updateOwnProfile(id: string, body: unknown): Promise<UserInfo> {
  const input = bodyObject(body);
  const displayName = checkDisplayName(input.displayName);
  await run(db.update(users).set({ displayName }).where(eq(users.id, id)));
  return userInfo(await requireUser(id));
}

/** Deletes a user with their sessions, tokens, logins, access and quotas; their files stay on disk. */
export async function deleteUser(actorId: string | null, id: string): Promise<void> {
  if (actorId === id) fail(409, 'self_change', 'You cannot delete your own account');
  await withTransaction(async () => {
    await requireUser(id);
    await run(db.delete(users).where(eq(users.id, id)));
    await ensureAdminRemains();
  });
}

/** An administrator sets a new password: the user's sessions end and they must choose their own at the next login. */
export async function resetPassword(id: string, body: unknown): Promise<UserInfo> {
  const input = bodyObject(body);
  await requireUser(id);
  await setPassword(id, input.password);
  await withTransaction(async () => {
    await run(db.update(users).set({ mustChangePassword: true }).where(eq(users.id, id)));
    await run(db.delete(sessions).where(eq(sessions.userId, id)));
  });
  return userInfo((await findUserById(id))!);
}

export async function recordLogin(id: string, at = new Date()): Promise<void> {
  await run(db.update(users).set({ lastLoginAt: at.toISOString() }).where(eq(users.id, id)));
}

export async function clearMustChangePassword(id: string): Promise<void> {
  await run(db.update(users).set({ mustChangePassword: false }).where(eq(users.id, id)));
}
