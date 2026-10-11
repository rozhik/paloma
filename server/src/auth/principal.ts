import type { AuthVia, LibraryAccess, Permission } from '../../../shared/types.js';
import { PERMISSIONS } from './permissions.js';
import { effectiveRateLimit, quotaLimits } from './quotas.js';
import { rolePermissionsOf } from './roles.js';
import { findUserById, storedAccess, type UserRow } from './users.js';

/** Who makes a request and what they may do; set on `res.locals.principal` for every API request. */
export interface Principal {
  /** Null when auth is off */
  user: UserRow | null;
  permissions: ReadonlySet<Permission>;
  /** What of the library they see; administrators always see everything */
  access: LibraryAccess;
  via: AuthVia;
  /** API requests per minute this principal may make; null when unlimited */
  rateLimit: number | null;
  sessionId?: string;
  tokenId?: string;
}

/** The single user of an install with auth off: every permission and the whole library. */
export const OFF_PRINCIPAL: Principal = Object.freeze<Principal>({
  user: null,
  permissions: new Set<Permission>(PERMISSIONS),
  access: { all: true },
  via: 'off',
  rateLimit: null,
});

export interface PrincipalOptions {
  via: 'session' | 'token';
  sessionId?: string;
  tokenId?: string;
  /** A token's permissions; the principal gets those the user's role also has */
  tokenPermissions?: readonly Permission[];
}

/**
 * The principal of an enabled user, with their role's current permissions (narrowed by a token's) and their
 * access. Null when the user does not exist or is disabled.
 */
export async function principalFor(userId: string, options: PrincipalOptions): Promise<Principal | null> {
  const user = await findUserById(userId);
  if (!user || !user.enabled) return null;
  const rolePermissions = await rolePermissionsOf(user.roleId);
  const permissions = new Set(options.tokenPermissions
    ? rolePermissions.filter((permission) => options.tokenPermissions!.includes(permission))
    : rolePermissions);
  // Administrators can grant themselves anything, so their access is never limited
  const access = rolePermissions.includes('users.manage') ? { all: true as const } : await storedAccess(user);
  return {
    user,
    permissions,
    access,
    via: options.via,
    rateLimit: effectiveRateLimit((await quotaLimits(user.id)).requests_per_minute),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.tokenId ? { tokenId: options.tokenId } : {}),
  };
}

export const can = (principal: Principal, permission: Permission): boolean => principal.permissions.has(permission);
