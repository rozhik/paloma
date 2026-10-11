import type { MeResponse } from '../../../shared/types.js';
import { config } from '../config.js';
import type { Principal } from './principal.js';
import { PERMISSIONS } from './permissions.js';
import { quotaInfos } from './quotas.js';
import { getRole } from './roles.js';
import { personAndAvatar } from './users.js';
import { isPersonVisible } from '../services/people.js';

/** `GET /api/auth/me` for a principal, with the role name in `lang`. */
export async function meResponse(principal: Principal, lang: string): Promise<MeResponse> {
  const { user } = principal;
  if (!user) {
    return { mode: config.auth.mode, via: principal.via, user: null, permissions: [...PERMISSIONS], access: { all: true }, quotas: [] };
  }
  return {
    mode: config.auth.mode,
    via: principal.via,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roleId: user.roleId,
      roleName: (await getRole(user.roleId, lang))?.name ?? user.roleId,
      mustChangePassword: user.mustChangePassword,
      ...await personAndAvatar(user),
      personVisible: user.personId !== null && await isPersonVisible(user.personId),
    },
    permissions: PERMISSIONS.filter((permission) => principal.permissions.has(permission)),
    access: principal.access,
    quotas: await quotaInfos(user.id, user.username),
  };
}
