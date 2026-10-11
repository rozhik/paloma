import type { Request, Response, Router } from 'express';
import { need, principalOf } from '../auth/middleware.js';
import { createRole, deleteRole, listRoles, updateRole } from '../auth/roles.js';
import { listSessions, revokeSession } from '../auth/sessions.js';
import { permissionInfos } from '../auth/texts.js';
import { listTokens, revokeToken } from '../auth/tokens.js';
import { createUser, deleteUser, ensureAdminRemains, listUsers, resetPassword, updateUser } from '../auth/users.js';
import { fail } from '../services/apiError.js';
import { normalizeLang } from '../services/placeCache.js';
import { asyncRoute } from './asyncRoute.js';
import { serverInfo } from '../services/serverInfo.js';
import { removeAvatar } from '../auth/avatars.js';
import { findUserById, userInfo } from '../auth/users.js';

const langOf = (req: Request) => normalizeLang(req.query.lang);
const actorOf = (res: Response) => principalOf(res).user?.id ?? null;

/**
 * Registers `/admin/*` (users, roles, permissions, and the sessions and tokens of everyone; needs `users.manage`)
 * and `/server/info` (needs `plugins.manage`).
 */
export function registerAdminRoutes(router: Router): void {
  router.get('/server/info', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await serverInfo());
  }));

  router.get('/admin/permissions', need('users.manage'), (req, res) => {
    res.json(permissionInfos(langOf(req)));
  });

  router.get('/admin/roles', need('users.manage'), asyncRoute(async (req, res) => {
    res.json(await listRoles(langOf(req)));
  }));

  router.post('/admin/roles', need('users.manage'), asyncRoute(async (req, res) => {
    res.status(201).json(await createRole(req.body, langOf(req)));
  }));

  router.patch('/admin/roles/:id', need('users.manage'), asyncRoute(async (req, res) => {
    res.json(await updateRole(req.params.id, req.body, ensureAdminRemains, langOf(req)));
  }));

  router.delete('/admin/roles/:id', need('users.manage'), asyncRoute(async (req, res) => {
    await deleteRole(req.params.id);
    res.json({ success: true });
  }));

  router.get('/admin/users', need('users.manage'), asyncRoute(async (req, res) => {
    res.json(await listUsers());
  }));

  router.post('/admin/users', need('users.manage'), asyncRoute(async (req, res) => {
    res.status(201).json(await createUser(req.body));
  }));

  router.patch('/admin/users/:id', need('users.manage'), asyncRoute(async (req, res) => {
    res.json(await updateUser(actorOf(res), req.params.id, req.body));
  }));

  router.delete('/admin/users/:id', need('users.manage'), asyncRoute(async (req, res) => {
    await deleteUser(actorOf(res), req.params.id);
    res.json({ success: true });
  }));

  router.delete('/admin/users/:id/avatar', need('users.manage'), asyncRoute(async (req, res) => {
    if (!(await findUserById(req.params.id))) fail(404, 'user_not_found', 'User not found');
    await removeAvatar(req.params.id);
    res.json(await userInfo((await findUserById(req.params.id))!));
  }));

  router.post('/admin/users/:id/password', need('users.manage', { sessionOnly: true }), asyncRoute(async (req, res) => {
    res.json(await resetPassword(req.params.id, req.body));
  }));

  router.get('/admin/sessions', need('users.manage', { sessionOnly: true }), asyncRoute(async (req, res) => {
    res.json(await listSessions(null, principalOf(res).sessionId));
  }));

  router.delete('/admin/sessions/:id', need('users.manage', { sessionOnly: true }), asyncRoute(async (req, res) => {
    if (!(await revokeSession(req.params.id, null))) fail(404, 'session_not_found', 'Session not found');
    res.json({ success: true });
  }));

  router.get('/admin/tokens', need('users.manage', { sessionOnly: true }), asyncRoute(async (req, res) => {
    res.json(await listTokens(null));
  }));

  router.delete('/admin/tokens/:id', need('users.manage', { sessionOnly: true }), asyncRoute(async (req, res) => {
    await revokeToken(req.params.id, null);
    res.json({ success: true });
  }));
}
