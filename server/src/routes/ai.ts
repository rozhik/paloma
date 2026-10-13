import type { Request, Router } from 'express';
import { need, principalOf } from '../auth/middleware.js';
import { normalizeLang } from '../services/placeCache.js';
import { asyncRoute } from './asyncRoute.js';
import {
  createAiTask, deleteAiTask, listAiProviders, photoAiResults, listAiTasks, listProviderModels, resetAiTask, saveProviderSettings, testProvider,
  updateAiTask,
} from '../ai/config.js';
import { startAiRun } from '../ai/runner.js';
import { describeTask } from '../tasks/api.js';

const langOf = (req: Request) => normalizeLang(req.query.lang);

/**
 * Registers `/ai/*`: provider settings and tasks (configured with `plugins.manage`; the task list is also open to
 * `ai.run`), starting runs (`ai.run`), and `/photos/:id/ai` (`library.view`).
 */
export function registerAiRoutes(router: Router): void {
  router.get('/ai/providers', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await listAiProviders(langOf(req)));
  }));

  router.put('/ai/providers/:id/settings', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await saveProviderSettings(req.params.id, req.body, langOf(req)));
  }));

  router.get('/ai/providers/:id/models', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await listProviderModels(req.params.id));
  }));

  router.post('/ai/providers/:id/test', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await testProvider(req.params.id));
  }));

  router.get('/ai/tasks', need('plugins.manage', { or: ['ai.run'] }), asyncRoute(async (req, res) => {
    res.json(await listAiTasks());
  }));

  router.post('/ai/tasks', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.status(201).json(await createAiTask(req.body));
  }));

  router.patch('/ai/tasks/:id', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await updateAiTask(req.params.id, req.body));
  }));

  router.delete('/ai/tasks/:id', need('plugins.manage'), asyncRoute(async (req, res) => {
    await deleteAiTask(req.params.id);
    res.json({ success: true });
  }));

  router.post('/ai/tasks/:id/reset', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await resetAiTask(req.params.id));
  }));

  // Following, pausing and cancelling a run goes through /tasks
  router.post('/ai/runs', need('ai.run'), asyncRoute(async (req, res) => {
    const principal = principalOf(res);
    res.status(202).json(await describeTask(principal, await startAiRun(req.body, langOf(req), principal)));
  }));

  router.get('/photos/:id/ai', need('library.view'), asyncRoute(async (req, res) => {
    res.json(await photoAiResults(Number(req.params.id)));
  }));
}
