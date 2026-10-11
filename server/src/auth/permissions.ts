import type { BuiltInRoleId, Permission } from '../../../shared/types.js';

/** Every permission, in the order they are listed. */
export const PERMISSIONS = [
  'library.view',
  'photos.edit',
  'albums.manage',
  'people.manage',
  'export',
  'account.tokens',
  'plugins.manage',
  'users.manage',
] as const satisfies readonly Permission[];

// Fails to compile when a permission of the shared type is missing from the list
type MissingPermission = Exclude<Permission, (typeof PERMISSIONS)[number]>;
const allListed: MissingPermission extends never ? true : never = true;
void allListed;

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);

/** The known permissions among `values`, in list order, without duplicates; unknown values are dropped. */
export function knownPermissions(values: readonly unknown[]): Permission[] {
  const set = new Set(values.filter(isPermission));
  return PERMISSIONS.filter((permission) => set.has(permission));
}

export interface BuiltInRole {
  id: BuiltInRoleId;
  permissions: readonly Permission[];
}

/** Roles shipped with Paloma; they cannot be changed or deleted and have no database rows. */
export const BUILT_IN_ROLES: readonly BuiltInRole[] = [
  { id: 'admin', permissions: PERMISSIONS },
  { id: 'editor', permissions: PERMISSIONS.filter((p) => p !== 'plugins.manage' && p !== 'users.manage') },
  { id: 'viewer', permissions: ['library.view'] },
];

export const builtInRole = (id: string): BuiltInRole | undefined => BUILT_IN_ROLES.find((role) => role.id === id);
