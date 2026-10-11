import type { Router } from 'express';
import { need, principalOf } from '../auth/middleware.js';
import { apiError } from '../services/apiError.js';
import { invalidDateFilter } from '../services/photoFilters.js';
import { getDocument, isObjectType, listDocuments, parsePaging } from '../model/documents.js';
import { modelSchema } from '../model/jsonSchema.js';
import { aiGuide } from '../model/guide.js';
import { runChangeset } from '../model/changes/apply.js';
import { asyncRoute } from './asyncRoute.js';

/**
 * Registers the object model: `/objects/:type` and `/objects/:type/:id` (documents), `/schema` and
 * `/schema/guide` (the JSON Schema and the guide for AI clients), all with `library.view`; and `/changes`, for
 * users who may change anything, which checks the permission of each change itself.
 */
export function registerModelRoutes(router: Router): void {
  router.get('/schema', need('library.view'), (req, res) => {
    res.type('application/schema+json').send(JSON.stringify(modelSchema()));
  });

  router.get('/schema/guide', need('library.view'), (req, res) => {
    res.type('text/markdown; charset=utf-8').send(aiGuide());
  });

  router.get('/objects/:type', need('library.view'), asyncRoute(async (req, res) => {
    const { type } = req.params;
    if (!isObjectType(type)) return res.status(400).json(apiError('invalid_field', 'type must be photo, album, person, folder or tag', { field: 'type' }));
    const paging = parsePaging(req.query);
    if ('field' in paging) {
      return res.status(400).json(apiError('invalid_field', `${paging.field} must be a whole number${paging.field === 'limit' ? ' from 1 to 500' : ''}`, { field: paging.field }));
    }
    const { limit, offset, ...filters } = req.query;
    const date = invalidDateFilter(filters);
    if (date) return res.status(400).json(apiError('invalid_date', `${date} must be a YYYY-MM-DD date`, { field: date }));
    res.json(await listDocuments(type, filters, paging));
  }));

  router.get('/objects/:type/:id', need('library.view'), asyncRoute(async (req, res) => {
    const { type, id } = req.params;
    if (!isObjectType(type)) return res.status(400).json(apiError('invalid_field', 'type must be photo, album, person, folder or tag', { field: 'type' }));
    const document = await getDocument(type, id);
    if (!document) return res.status(404).json(apiError('object_not_found', `No ${type} ${id}`, { type, id }));
    res.json(document);
  }));

  router.post('/changes', need('photos.edit', { or: ['albums.manage', 'people.manage'] }), asyncRoute(async (req, res) => {
    const result = await runChangeset(req.body, principalOf(res));
    res.status(result.status).json(result.body);
  }));
}
