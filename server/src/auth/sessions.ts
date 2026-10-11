import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { and, eq, lt, ne } from 'drizzle-orm';
import type { SessionInfo } from '../../../shared/types.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { all, get, run } from '../db/query.js';
import { sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'paloma_session';
/** `last_used_at` is written at most this often per session, so image requests do not each write */
const TOUCH_INTERVAL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SessionRow = typeof sessions.$inferSelect;

export const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const idleLimitMs = (): number => config.auth.sessionDays * DAY_MS;

const isExpired = (session: SessionRow, now: Date): boolean => now.getTime() - Date.parse(session.lastUsedAt) > idleLimitMs();

/** Starts a session; returns its id and the secret cookie value, of which only the hash is stored. */
export async function createSession(
  userId: string, client: { userAgent?: string | null; ip?: string | null }, now = new Date(),
): Promise<{ id: string; cookieValue: string }> {
  const cookieValue = crypto.randomBytes(32).toString('base64url');
  const id = crypto.randomUUID();
  await run(db.insert(sessions).values({
    id,
    tokenHash: sha256(cookieValue),
    userId,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    userAgent: client.userAgent?.slice(0, 300) ?? null,
    ip: client.ip ?? null,
  }));
  return { id, cookieValue };
}

/**
 * The session of a cookie value, extended by this use; undefined when it is unknown, revoked or idle for too
 * long (an expired one is deleted).
 */
export async function useSession(cookieValue: string, client: { userAgent?: string | null; ip?: string | null }, now = new Date()): Promise<SessionRow | undefined> {
  const session = await get(db.select().from(sessions).where(eq(sessions.tokenHash, sha256(cookieValue))));
  if (!session) return undefined;
  if (isExpired(session, now)) {
    await run(db.delete(sessions).where(eq(sessions.id, session.id)));
    return undefined;
  }
  if (now.getTime() - Date.parse(session.lastUsedAt) >= TOUCH_INTERVAL_MS) {
    const touched = {
      lastUsedAt: now.toISOString(), userAgent: client.userAgent?.slice(0, 300) ?? session.userAgent, ip: client.ip ?? session.ip,
    };
    await run(db.update(sessions).set(touched).where(eq(sessions.id, session.id)));
    return { ...session, ...touched };
  }
  return session;
}

/** Sessions that are still valid: of one user, or of everyone when `userId` is null. */
export async function listSessions(userId: string | null, currentId: string | undefined, now = new Date()): Promise<SessionInfo[]> {
  const rows = await all(db.select({ session: sessions, username: users.username }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(userId === null ? undefined : eq(sessions.userId, userId))
    .orderBy(sessions.lastUsedAt));
  return rows.filter(({ session }) => !isExpired(session, now)).reverse().map(({ session, username }) => ({
    id: session.id,
    userId: session.userId,
    username,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    userAgent: session.userAgent,
    ip: session.ip,
    current: session.id === currentId,
  }));
}

/** Ends a session; of `userId` only when given. Returns whether one was ended. */
export async function revokeSession(id: string, userId: string | null): Promise<boolean> {
  const where = userId === null ? eq(sessions.id, id) : and(eq(sessions.id, id), eq(sessions.userId, userId));
  return (await run(db.delete(sessions).where(where))).changes > 0;
}

/** Ends every session of a user except `keepId`. */
export async function endOtherSessions(userId: string, keepId: string | undefined): Promise<void> {
  await run(db.delete(sessions).where(keepId ? and(eq(sessions.userId, userId), ne(sessions.id, keepId)) : eq(sessions.userId, userId)));
}

/** Deletes sessions idle for longer than the configured lifetime. */
export async function pruneSessions(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - idleLimitMs()).toISOString();
  return (await run(db.delete(sessions).where(lt(sessions.lastUsedAt, cutoff)))).changes;
}

/** The value of a cookie of the request, parsed from the Cookie header. */
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** The cookie scripts cannot read and other sites do not send; `Secure` when the request came over HTTPS. */
export function setSessionCookie(req: Request, res: Response, value: string): void {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/',
    maxAge: idleLimitMs(),
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' });
}
