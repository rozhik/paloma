import { config } from '../config.js';
import { fail } from '../services/apiError.js';
import type { Principal } from './principal.js';
import { folderSize, quotaLimits, userExportDir } from './quotas.js';

/** Where a request's exports and movies go, and how much space is left there. */
export interface ExportSpace {
  /** The export folder, or the user's folder in it when auth is on */
  root: string;
  /** Bytes allowed in `root`; null when unlimited */
  limit: number | null;
  /** Bytes in `root` now */
  used: number;
}

export async function exportSpaceOf(principal: Principal): Promise<ExportSpace> {
  if (config.auth.mode !== 'on' || !principal.user) return { root: config.exportDir, limit: null, used: 0 };
  const root = userExportDir(principal.user.username);
  const limit = (await quotaLimits(principal.user.id)).export_bytes;
  return { root, limit, used: limit === null ? 0 : await folderSize(root) };
}

/** Whether `bytes` more still fit. */
export const fits = (space: ExportSpace, bytes: number): boolean => space.limit === null || space.used + bytes <= space.limit;

/** Throws 409 `quota_exceeded` when the space is already full. */
export function requireSpace(space: ExportSpace): void {
  if (space.limit !== null && space.used >= space.limit) {
    fail(409, 'quota_exceeded', 'Your export space is full; delete exported files to make room', { limit: space.limit, used: space.used });
  }
}
