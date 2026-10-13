import type { Router } from 'express';
import { need, principalOf } from '../auth/middleware.js';
import { asyncRoute } from './asyncRoute.js';
import { cancelTask, listTasks, moveTask, pauseTask, resumeTask } from '../tasks/api.js';

/**
 * Registers `/tasks/*`. Everyone who sees the library sees the queue; who may change a task depends on the task
 * (its owner with the permission of its kind, or users.manage), so those routes check it themselves.
 */
export function registerTaskRoutes(router: Router): void {
  router.get('/tasks', need('library.view'), asyncRoute(async (req, res) => {
    res.json(await listTasks(principalOf(res)));
  }));

  router.post('/tasks/:id/pause', need('authenticated'), asyncRoute(async (req, res) => {
    res.json(await pauseTask(principalOf(res), req.params.id));
  }));

  router.post('/tasks/:id/resume', need('authenticated'), asyncRoute(async (req, res) => {
    res.json(await resumeTask(principalOf(res), req.params.id));
  }));

  router.post('/tasks/:id/move', need('authenticated'), asyncRoute(async (req, res) => {
    res.json(await moveTask(principalOf(res), req.params.id, req.body));
  }));

  router.delete('/tasks/:id', need('authenticated'), asyncRoute(async (req, res) => {
    res.json({ task: await cancelTask(principalOf(res), req.params.id) });
  }));
}
