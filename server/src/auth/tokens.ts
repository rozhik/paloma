import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ApiTokenInfo, CreatedApiToken, Permission } from '../../../shared/types.js';
import { db } from '../db/index.js';
import { all, get, run } from '../db/query.js';
import { apiTokens, users } from '../db/schema.js';
import { fail } from '../services/apiError.js';
import { isPermission, knownPermissions } from './permissions.js';
import { sha256 } from './sessions.js';

/** Token values start with this, so logs and secret scanners can recognize them */
export const TOKEN_PREFIX = 'pal_';
const MAX_NAME = 100;
/** `last_used_at` is written at most this often per token */
const TOUCH_INTERVAL_MS = 60_000;

type TokenRow = typeof apiTokens.$inferSelect;

function info(row: TokenRow, username: string): ApiTokenInfo {
  return {
    id: row.id,
    userId: row.userId,
    username,
    name: row.name,
    permissions: knownPermissions(JSON.parse(row.permissions) as unknown[]),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  };
}

/**
 * Creates a personal token for a user. Its permissions must be among `ownPermissions`; otherwise 403
 * `token_scope_exceeded`. The value is returned this once; only its hash is stored.
 */
export async function createToken(userId: string, ownPermissions: ReadonlySet<Permission>, body: unknown, now = new Date()): Promise<CreatedApiToken> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) fail(400, 'invalid_body', 'Body must be an object');
  const input = body as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > MAX_NAME) fail(400, 'invalid_field', `name must have 1 to ${MAX_NAME} characters`, { field: 'name' });
  if (!Array.isArray(input.permissions) || input.permissions.length === 0 || !input.permissions.every(isPermission)) {
    fail(400, 'invalid_field', 'permissions must be a non-empty list of known permissions', { field: 'permissions' });
  }
  const permissions = knownPermissions(input.permissions);
  const beyond = permissions.filter((permission) => !ownPermissions.has(permission));
  if (beyond.length > 0) {
    fail(403, 'token_scope_exceeded', `A token cannot have permissions you do not have: ${beyond.join(', ')}`, { permissions: beyond.join(', ') });
  }
  let expiresAt: string | null = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    const time = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : NaN;
    if (Number.isNaN(time) || time <= now.getTime()) {
      fail(400, 'invalid_field', 'expiresAt must be a date in the future', { field: 'expiresAt' });
    }
    expiresAt = new Date(time).toISOString();
  }

  const value = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
  const row: TokenRow = {
    id: crypto.randomUUID(),
    userId,
    name,
    tokenHash: sha256(value),
    permissions: JSON.stringify(permissions),
    createdAt: now.toISOString(),
    lastUsedAt: null,
    expiresAt,
  };
  await run(db.insert(apiTokens).values(row));
  const owner = await get(db.select({ username: users.username }).from(users).where(eq(users.id, userId)));
  return { ...info(row, owner?.username ?? ''), value };
}

/** Tokens of one user, or of everyone when `userId` is null, newest first. */
export async function listTokens(userId: string | null): Promise<ApiTokenInfo[]> {
  const rows = await all(db.select({ token: apiTokens, username: users.username }).from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(userId === null ? undefined : eq(apiTokens.userId, userId))
    .orderBy(apiTokens.createdAt));
  return rows.reverse().map(({ token, username }) => info(token, username));
}

/** Revokes a token; of `userId` only when given. Throws 404 when there is none. */
export async function revokeToken(id: string, userId: string | null): Promise<void> {
  const where = userId === null ? eq(apiTokens.id, id) : and(eq(apiTokens.id, id), eq(apiTokens.userId, userId));
  if ((await run(db.delete(apiTokens).where(where))).changes === 0) fail(404, 'token_not_found', `Token ${id} not found`, { id });
}

/**
 * The owner and permissions of the token with this id while it exists (not revoked) and has not expired; null
 * otherwise. Does not record a use. Whether the owner is enabled is checked by the caller.
 */
export async function tokenById(id: string, now = new Date()): Promise<{ userId: string; permissions: Permission[] } | null> {
  const row = await get(db.select().from(apiTokens).where(eq(apiTokens.id, id)));
  if (!row) return null;
  if (row.expiresAt !== null && Date.parse(row.expiresAt) <= now.getTime()) return null;
  return { userId: row.userId, permissions: knownPermissions(JSON.parse(row.permissions) as unknown[]) };
}

/**
 * The owner, id and permissions of a valid token value, recording the use; null for an unknown, revoked or
 * expired one. Whether the owner is enabled is checked by the caller.
 */
export async function verifyApiToken(value: string, now = new Date()): Promise<{ userId: string; tokenId: string; permissions: Permission[] } | null> {
  if (typeof value !== 'string' || !value.startsWith(TOKEN_PREFIX)) return null;
  const row = await get(db.select().from(apiTokens).where(eq(apiTokens.tokenHash, sha256(value))));
  if (!row) return null;
  if (row.expiresAt !== null && Date.parse(row.expiresAt) <= now.getTime()) return null;
  if (row.lastUsedAt === null || now.getTime() - Date.parse(row.lastUsedAt) >= TOUCH_INTERVAL_MS) {
    await run(db.update(apiTokens).set({ lastUsedAt: now.toISOString() }).where(eq(apiTokens.id, row.id)));
  }
  return { userId: row.userId, tokenId: row.id, permissions: knownPermissions(JSON.parse(row.permissions) as unknown[]) };
}
