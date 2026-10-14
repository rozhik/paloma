import type { Request, Router } from 'express';
import { need, principalOf } from '../auth/middleware.js';
import { can } from '../auth/principal.js';
import { normalizeLang } from '../services/placeCache.js';
import { asyncRoute } from './asyncRoute.js';
import {
  addProviderModel, aiUsage, createAiProvider, createAiTask, deleteAiProvider, deleteAiTask, listAiProviders, listAiTasks, listCatalogModels, listProviderModels,
  photoAiResults, refreshProviderModels, renameAiProvider, resetAiTask, saveProviderSettings, testProvider, updateAiTask, updateProviderModel,
} from '../ai/config.js';
import { startAiRun } from '../ai/runner.js';
import { describeTask } from '../tasks/api.js';

const langOf = (req: Request) => normalizeLang(req.query.lang);

/**
 * Registers `/ai/*`: providers, their models and tasks (configured with `plugins.manage`; the task list is also open
 * to `ai.run`, the model catalogue to `library.view`), starting runs (`ai.run`), and `/photos/:id/ai` (`library.view`).
 */
export function registerAiRoutes(router: Router): void {
  router.get('/ai/providers', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await listAiProviders(langOf(req)));
  }));

  router.post('/ai/providers', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.status(201).json(await createAiProvider(req.body, langOf(req)));
  }));

  router.patch('/ai/providers/:id', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await renameAiProvider(req.params.id, req.body, langOf(req)));
  }));

  router.delete('/ai/providers/:id', need('plugins.manage'), asyncRoute(async (req, res) => {
    await deleteAiProvider(req.params.id);
    res.json({ success: true });
  }));

  router.put('/ai/providers/:id/settings', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await saveProviderSettings(req.params.id, req.body, langOf(req)));
  }));

  router.get('/ai/providers/:id/models', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await listProviderModels(req.params.id));
  }));

  // The stored model catalogue: everyone who can view the library reads it; disabled models only `plugins.manage`
  router.get('/ai/models', need('library.view'), asyncRoute(async (_req, res) => {
    res.json(await listCatalogModels(can(principalOf(res), 'plugins.manage')));
  }));

  router.post('/ai/providers/:id/models/refresh', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await refreshProviderModels(req.params.id));
  }));

  router.post('/ai/providers/:id/models', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.status(201).json(await addProviderModel(req.params.id, req.body));
  }));

  // Model ids hold `/` and `:`, so clients send them URL-encoded
  router.patch('/ai/providers/:id/models/:model', need('plugins.manage'), asyncRoute(async (req, res) => {
    res.json(await updateProviderModel(req.params.id, req.params.model, req.body));
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

  // Someone without `users.manage` sees only their own calls
  router.get('/ai/usage', need('authenticated'), asyncRoute(async (req, res) => {
    const principal = principalOf(res);
    res.json(await aiUsage(req.query, { all: can(principal, 'users.manage'), ownUserId: principal.user?.id ?? null }));
  }));

  router.get('/photos/:id/ai', need('library.view'), asyncRoute(async (req, res) => {
    res.json(await photoAiResults(Number(req.params.id)));
  }));
}
