import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { QuotaInfo, QuotaKind } from '../../../shared/types.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { all, run } from '../db/query.js';
import { userQuotas } from '../db/schema.js';
import { fail } from '../services/apiError.js';

/** Every quota kind; a new kind (e.g. uploads) is added here and needs no schema change. */
export const QUOTA_KINDS = ['export_bytes', 'requests_per_minute'] as const satisfies readonly QuotaKind[];

export type QuotaLimits = Record<QuotaKind, number | null>;

const NO_LIMITS: QuotaLimits = { export_bytes: null, requests_per_minute: null };

const isQuotaKind = (value: string): value is QuotaKind => (QUOTA_KINDS as readonly string[]).includes(value);

/** A user's stored limits; null is unlimited export space or the default request rate. */
export async function quotaLimits(userId: string): Promise<QuotaLimits> {
  const limits = { ...NO_LIMITS };
  for (const row of await all(db.select().from(userQuotas).where(eq(userQuotas.userId, userId)))) {
    if (isQuotaKind(row.kind)) limits[row.kind] = row.limitValue;
  }
  return limits;
}

/** Checks a `quotas` body field: an object of kinds to non-negative integers or null. Throws 400. */
export function parseQuotaLimits(value: unknown): Partial<QuotaLimits> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(400, 'invalid_field', 'quotas must be an object', { field: 'quotas' });
  }
  const limits: Partial<QuotaLimits> = {};
  for (const [kind, limit] of Object.entries(value)) {
    if (!isQuotaKind(kind)) fail(400, 'invalid_field', `Unknown quota ${kind}`, { field: `quotas.${kind}` });
    if (limit !== null && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0)) {
      fail(400, 'invalid_field', `quotas.${kind} must be a non-negative integer or null`, { field: `quotas.${kind}` });
    }
    limits[kind] = limit;
  }
  return limits;
}

/** Saves limits; kinds not in `limits` keep their value. Call inside the transaction that changes the user. */
export async function setQuotaLimits(userId: string, limits: Partial<QuotaLimits>): Promise<void> {
  for (const [kind, limit] of Object.entries(limits) as [QuotaKind, number | null][]) {
    await run(db.insert(userQuotas).values({ userId, kind, limitValue: limit })
      .onConflictDoUpdate({ target: [userQuotas.userId, userQuotas.kind], set: { limitValue: limit } }));
  }
}

/** Requests per minute that apply to a user: their limit, else the default from `.env`; null when unlimited. */
export function effectiveRateLimit(limit: number | null): number | null {
  const value = limit ?? config.auth.rateLimit;
  return value === 0 ? null : value;
}

/** The folder a user's exports and movies are written to when auth is on. */
export function userExportDir(username: string): string {
  return path.join(config.exportDir, username);
}

/** Total size in bytes of the files under `dir`; 0 when it does not exist. Symlinks are not followed. */
export async function folderSize(dir: string): Promise<number> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(full);
    else if (entry.isFile()) total += (await fs.promises.stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/** A user's quotas with the export space they use. */
export async function quotaInfos(userId: string, username: string): Promise<QuotaInfo[]> {
  const limits = await quotaLimits(userId);
  return [
    { kind: 'export_bytes', limit: limits.export_bytes, effectiveLimit: limits.export_bytes, used: await folderSize(userExportDir(username)) },
    { kind: 'requests_per_minute', limit: limits.requests_per_minute, effectiveLimit: effectiveRateLimit(limits.requests_per_minute) },
  ];
}
