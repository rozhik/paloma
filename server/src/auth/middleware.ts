import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Permission } from '../../../shared/types.js';
import { config } from '../config.js';
import { apiError, fail } from '../services/apiError.js';
import { OFF_PRINCIPAL, principalFor, type Principal } from './principal.js';
import { authenticateBearer } from './providers.js';
import { runWithAccess } from './scope.js';
import { SESSION_COOKIE, clearSessionCookie, readCookie, useSession } from './sessions.js';

const NOTHING = { all: false as const, folders: [], albums: [] };

export const authOn = (): boolean => config.auth.mode === 'on';

/** The client of a request as sessions record it. */
export const clientOf = (req: Request) => ({ userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null });

/**
 * Sets `res.locals.principal`: the single user when auth is off; otherwise the user of a valid bearer
 * credential or session cookie, or nothing. A request with an invalid bearer credential gets no principal
 * (no falling back to the cookie). Whether a route needs one is decided by its `need()` guard.
 */
export function authenticate(): RequestHandler {
  return (req, res, next) => {
    resolvePrincipal(req, res).then((principal) => {
      res.locals.principal = principal;
      // The rest of the request sees only this part of the library; nothing without a user
      runWithAccess(principal?.access ?? NOTHING, () => next());
    }, next);
  };
}

async function resolvePrincipal(req: Request, res: Response): Promise<Principal | undefined> {
  if (!authOn()) return OFF_PRINCIPAL;
  const header = req.get('authorization');
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    if (!match) return undefined;
    const bearer = await authenticateBearer(match[1]);
    if (!bearer) return undefined;
    return (await principalFor(bearer.userId, {
      via: 'token',
      ...(bearer.tokenId ? { tokenId: bearer.tokenId } : {}),
      ...(bearer.permissions ? { tokenPermissions: bearer.permissions } : {}),
    })) ?? undefined;
  }
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return undefined;
  const session = await useSession(cookie, clientOf(req));
  const principal = session && await principalFor(session.userId, { via: 'session', sessionId: session.id });
  if (!principal) clearSessionCookie(req, res);
  return principal ?? undefined;
}

/** The principal set by `authenticate()`; the single user when a router is used without it (auth off). */
export function principalOf(res: Response): Principal {
  return (res.locals.principal as Principal | undefined) ?? (authOn() ? unauthenticated() : OFF_PRINCIPAL);
}

function unauthenticated(): never {
  fail(401, 'unauthenticated', 'Log in to use Paloma');
}

/** What a route needs: no user, any user, or a permission. */
export type Requirement = 'public' | 'authenticated' | Permission;

export interface GuardOptions {
  /** Refused to API tokens (managing credentials, sessions and tokens) */
  sessionOnly?: boolean;
  /** Other permissions that are enough instead of the required one */
  or?: Permission[];
}

/** A route guard, marked so a test can check that every route has exactly one. */
export type Guard = RequestHandler & { requirement: Requirement; sessionOnly: boolean };

/**
 * The guard a route starts with: 401 without a user when auth is on, 403 `permission_required` naming the
 * missing permission, 403 `session_required` for a token on a session-only route.
 */
export function need(requirement: Requirement, options: GuardOptions = {}): Guard {
  const guard = ((req: Request, res: Response, next: NextFunction) => {
    if (requirement === 'public') return next();
    const principal = res.locals.principal as Principal | undefined ?? (authOn() ? undefined : OFF_PRINCIPAL);
    if (!principal) {
      return res.status(401).json(apiError('unauthenticated', 'Log in to use Paloma'));
    }
    if (options.sessionOnly && principal.via === 'token') {
      return res.status(403).json(apiError('session_required', 'API tokens cannot do this; log in in the browser'));
    }
    if (requirement !== 'authenticated' && !principal.permissions.has(requirement)
      && !(options.or ?? []).some((permission) => principal.permissions.has(permission))) {
      return res.status(403).json(apiError('permission_required', `This needs the permission ${requirement}`, { permission: requirement }));
    }
    next();
  }) as Guard;
  guard.requirement = requirement;
  guard.sessionOnly = options.sessionOnly === true;
  return guard;
}
