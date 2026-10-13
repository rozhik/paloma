import type { Router } from 'express';
import { need, principalOf } from '../auth/middleware.js';
import { asyncRoute } from './asyncRoute.js';
import { getKeymap, listPresets, saveKeymap } from '../services/keymapApi.js';

/** Registers `/keymap*`: every user reads and replaces only their own keymap, with no permission beyond being logged in. */
export function registerKeymapRoutes(router: Router): void {
  router.get('/keymap', need('authenticated'), asyncRoute(async (req, res) => {
    res.json({ keymap: await getKeymap(principalOf(res)) });
  }));

  router.put('/keymap', need('authenticated'), asyncRoute(async (req, res) => {
    res.json(await saveKeymap(principalOf(res), req.body, Number(req.get('content-length') ?? 0)));
  }));

  router.get('/keymap/presets', need('authenticated'), asyncRoute(async (req, res) => {
    res.json(listPresets());
  }));
}
