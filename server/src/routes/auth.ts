import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import type { AuthStatus } from '../../../shared/types.js';
import { checkPassword, setPassword, verifyPassword } from '../auth/credentials.js';
import { meResponse } from '../auth/me.js';
import { AVATAR_TYPES, MAX_AVATAR_BYTES, avatarFile, removeAvatar, saveAvatar } from '../auth/avatars.js';
import { authOn, clientOf, need, principalOf } from '../auth/middleware.js';
import { principalFor, type Principal } from '../auth/principal.js';
import { loginProviderInfos, loginWith } from '../auth/providers.js';
import {
  clearSessionCookie, createSession, endOtherSessions, listSessions, revokeSession, setSessionCookie,
} from '../auth/sessions.js';
import { checkSetupCode, finishSetup, prepareSetup } from '../auth/setup.js';
import { loginThrottle } from '../auth/throttle.js';
import { createToken, listTokens, revokeToken } from '../auth/tokens.js';
import { clearMustChangePassword, countUsers, createUser, findUserById, recordLogin, updateOwnProfile } from '../auth/users.js';
import { fail, HttpError, apiError } from '../services/apiError.js';
import { normalizeLang } from '../services/placeCache.js';
import { asyncRoute, sendFileOr404 } from './asyncRoute.js';

const langOf = (req: Request) => normalizeLang(req.query.lang);

/** The logged-in user of a request; 409 when auth is off and there is no user to act on. */
function userOf(res: Response): NonNullable<Principal['user']> {
  const { user } = principalOf(res);
  if (!user) fail(409, 'session_required', 'Users are switched off; set PALOMA_AUTH=on to use accounts');
  return user;
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) fail(400, 'invalid_body', 'Body must be an object');
  return body as Record<string, unknown>;
}

/** Starts a session for a user who just logged in and answers with `GET /api/auth/me`. */
async function startSession(req: Request, res: Response, userId: string): Promise<void> {
  const { id, cookieValue } = await createSession(userId, clientOf(req));
  await recordLogin(userId);
  setSessionCookie(req, res, cookieValue);
  const principal = (await principalFor(userId, { via: 'session', sessionId: id }))!;
  res.json(await meResponse(principal, langOf(req)));
}

/** Reads an image body for an avatar; a body that is too large is a 400 `avatar_invalid`, like any unusable file. */
const avatarBody: RequestHandler = (req, res, next) => {
  express.raw({ type: AVATAR_TYPES, limit: MAX_AVATAR_BYTES })(req, res, (err?: unknown) => {
    if (err) return next(new HttpError(400, apiError('avatar_invalid', 'Send a JPEG, PNG or WebP image of at most 10 MB')));
    next();
  });
};

/** Registers `/auth/*`: status, setup, login, logout, the current user, password, sessions and tokens. */
export function registerAuthRoutes(router: Router): void {
  router.get('/auth/status', need('public'), asyncRoute(async (req, res) => {
    const status: AuthStatus = authOn()
      ? { mode: 'on', setupPending: await countUsers() === 0, providers: await loginProviderInfos(langOf(req)) }
      : { mode: 'off', setupPending: false, providers: [] };
    res.json(status);
  }));

  router.post('/auth/setup', need('public'), asyncRoute(async (req, res) => {
    if (!authOn() || await countUsers() > 0) fail(409, 'setup_done', 'The first administrator already exists');
    const input = bodyObject(req.body);
    await prepareSetup();
    if (!checkSetupCode(input.setupCode)) fail(400, 'setup_code_wrong', 'The setup code is wrong; see the server log');
    const { setupCode: _code, ...fields } = input;
    // createUser re-checks the username inside its transaction; a second setup racing this one fails there
    if (await countUsers() > 0) fail(409, 'setup_done', 'The first administrator already exists');
    const admin = await createUser(fields, { roleId: 'admin', mustChangePassword: false });
    finishSetup();
    await startSession(req, res, admin.id);
  }));

  router.post('/auth/login/:provider', need('public'), asyncRoute(async (req, res) => {
    if (!authOn()) fail(409, 'setup_done', 'Users are switched off; there is nothing to log in to');
    const input = bodyObject(req.body);
    const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
    const key = `${req.params.provider}:${(fields.username ?? req.ip ?? '').trim().toLowerCase()}`;
    const wait = loginThrottle.retryAfter(key);
    if (wait > 0) {
      throw new HttpError(429, apiError('login_throttled', `Too many failed logins; try again in ${wait} seconds`, { seconds: wait }),
        { 'Retry-After': String(wait) });
    }
    const userId = await loginWith(req.params.provider, fields);
    if (!userId) {
      loginThrottle.recordFailure(key);
      fail(401, 'login_failed', 'The username or password is wrong');
    }
    loginThrottle.recordSuccess(key);
    await startSession(req, res, userId);
  }));

  router.post('/auth/logout', need('authenticated', { sessionOnly: true }), asyncRoute(async (req, res) => {
    const { sessionId } = principalOf(res);
    if (sessionId) await revokeSession(sessionId, null);
    clearSessionCookie(req, res);
    res.json({ success: true });
  }));

  router.get('/auth/me', need('authenticated'), asyncRoute(async (req, res) => {
    res.json(await meResponse(principalOf(res), langOf(req)));
  }));

  router.patch('/auth/me', need('authenticated'), asyncRoute(async (req, res) => {
    const user = userOf(res);
    await updateOwnProfile(user.id, req.body);
    res.json(await meResponse((await principalFor(user.id, { via: principalOf(res).via === 'token' ? 'token' : 'session' }))!, langOf(req)));
  }));

  router.put('/auth/avatar', need('authenticated'), avatarBody, asyncRoute(async (req, res) => {
    const user = userOf(res);
    await saveAvatar(user.id, req.body);
    res.json(await meResponse((await principalFor(user.id, { via: principalOf(res).via === 'token' ? 'token' : 'session' }))!, langOf(req)));
  }));

  router.delete('/auth/avatar', need('authenticated'), asyncRoute(async (req, res) => {
    const user = userOf(res);
    await removeAvatar(user.id);
    res.json(await meResponse((await principalFor(user.id, { via: principalOf(res).via === 'token' ? 'token' : 'session' }))!, langOf(req)));
  }));

  // Any logged-in user may see others' avatars (the Admin list, and later sharing); the URL changes with each upload
  router.get('/users/:id/avatar', need('authenticated'), asyncRoute(async (req, res, next) => {
    const user = await findUserById(req.params.id);
    if (!user?.avatarVersion) return res.status(404).json(apiError('file_not_found', 'No avatar'));
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    sendFileOr404(res, next, avatarFile(user.id), 'file_not_found', 'No avatar');
  }));

  router.post('/auth/password', need('authenticated', { sessionOnly: true }), asyncRoute(async (req, res) => {
    const user = userOf(res);
    const input = bodyObject(req.body);
    checkPassword(input.newPassword, 'newPassword');
    if (!(await verifyPassword(user.id, input.currentPassword))) fail(400, 'password_wrong', 'The current password is wrong');
    await setPassword(user.id, input.newPassword);
    await endOtherSessions(user.id, principalOf(res).sessionId);
    await clearMustChangePassword(user.id);
    res.json({ success: true });
  }));

  router.get('/auth/sessions', need('authenticated', { sessionOnly: true }), asyncRoute(async (req, res) => {
    const user = userOf(res);
    res.json(await listSessions(user.id, principalOf(res).sessionId));
  }));

  router.delete('/auth/sessions/:id', need('authenticated', { sessionOnly: true }), asyncRoute(async (req, res) => {
    const user = userOf(res);
    if (!(await revokeSession(req.params.id, user.id))) fail(404, 'session_not_found', 'Session not found');
    if (req.params.id === principalOf(res).sessionId) clearSessionCookie(req, res);
    res.json({ success: true });
  }));

  router.get('/auth/tokens', need('authenticated'), asyncRoute(async (req, res) => {
    res.json(await listTokens(userOf(res).id));
  }));

  router.post('/auth/tokens', need('account.tokens', { sessionOnly: true }), asyncRoute(async (req, res) => {
    const principal = principalOf(res);
    res.status(201).json(await createToken(userOf(res).id, principal.permissions, req.body));
  }));

  router.delete('/auth/tokens/:id', need('authenticated', { sessionOnly: true }), asyncRoute(async (req, res) => {
    await revokeToken(req.params.id, userOf(res).id);
    res.json({ success: true });
  }));
}
