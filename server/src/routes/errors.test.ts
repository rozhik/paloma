import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_errors_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');
  vi.stubEnv('PALOMA_GEOCODER_URL', '');

  await (await import('../db/index.js')).openDatabase();
  const { default: express } = await import('express');
  // Typed as the module under CommonJS interop; at runtime `default` is the router
  const router = (await import('./index.js')).default as unknown as import('express').Router;
  const { apiErrorHandler } = await import('../services/apiError.js');

  const app = express();
  app.use(express.json());
  app.use('/api', router);
  app.use('/api', apiErrorHandler);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const send = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

describe('API error responses', () => {
  it.each([
    ['PUT', '/photos/999999/edits', { edits: [] }, 404, 'photo_not_found'],
    ['POST', '/photos/999999/preview', { edits: [] }, 404, 'photo_not_found'],
    ['GET', '/photos/999999/thumbnail', undefined, 404, 'photo_not_found'],
    ['GET', '/raw/999999', undefined, 404, 'photo_not_found'],
    ['GET', '/cache/thumbnail/nope', undefined, 404, 'file_not_found'],
    ['GET', '/cache/preview/nope', undefined, 404, 'file_not_found'],
    ['POST', '/export', { photoIds: [1] }, 400, 'export_params_required'],
    ['POST', '/creation/movie', { photoIds: [] }, 400, 'photo_ids_required'],
    ['POST', '/people', { name: '' }, 400, 'person_name_required'],
    ['PATCH', '/photos/999999', { isStarred: true }, 404, 'photo_not_found'],
    ['POST', '/albums', '{broken', 400, 'invalid_body'],
    ['PATCH', '/photos/1', { location: { lat: 91, lon: 0 } }, 400, 'invalid_location'],
    ['POST', '/photos/location', { photoIds: [], location: null }, 400, 'photo_ids_required'],
    ['POST', '/photos/location', { photoIds: [1], location: 'here' }, 400, 'invalid_location'],
    ['POST', '/photos/location', { photoIds: [999999], location: null }, 404, 'photo_not_found'],
    ['GET', '/geo/search?q=Lviv', undefined, 503, 'geocoder_disabled'],
    ['GET', '/geo/places?lang=en', undefined, 503, 'geocoder_disabled'],
  ])('%s %s with %j responds %i %s', async (method, url, body, status, code) => {
    expect(await send(method, url, body)).toEqual({ status, body: { error: expect.any(String), code } });
  });
});

describe('geo routes', () => {
  it('serve the map settings and an empty list of points', async () => {
    expect(await send('GET', '/geo/settings')).toEqual({
      status: 200,
      body: { geocoding: false, tileUrl: expect.stringContaining('{z}'), tileAttribution: expect.any(String) },
    });
    expect(await send('GET', '/geo/points?geotagged=true')).toEqual({ status: 200, body: [] });
  });

  it('rejects an invalid date range of the photo list, naming the field', async () => {
    expect(await send('GET', '/photos?takenFrom=2016-10-03&takenTo=2016-13-40')).toEqual({
      status: 400, body: { error: expect.any(String), code: 'invalid_date', params: { field: 'takenTo' } },
    });
  });
});

describe('photos whose file is gone', () => {
  let photoId: number;

  beforeAll(async () => {
    const { db } = await import('../db/index.js');
    const schema = await import('../db/schema.js');
    const folderId = db.insert(schema.folders).values({ path: path.join(tmpDir, 'gone'), name: 'gone', indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
    photoId = db.insert(schema.photos).values({ folderId, filename: 'missing.jpg', fileHash: 'missing', createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
  });

  it.each(['thumbnail', 'preview', 'face-source'])('answer GET /photos/:id/%s with 404 file_not_found', async (image) => {
    expect(await send('GET', `/photos/${photoId}/${image}`)).toEqual({ status: 404, body: { error: expect.any(String), code: 'file_not_found' } });
  });

  it('answer GET /raw/:id with a JSON 404 file_not_found', async () => {
    const res = await fetch(`${base}/raw/${photoId}`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: expect.any(String), code: 'file_not_found' });
  });

  it('answer a missing cached thumbnail with JSON, not an image type', async () => {
    const res = await fetch(`${base}/cache/thumbnail/missing`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
