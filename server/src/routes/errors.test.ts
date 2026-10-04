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
    ['POST', '/photos/999999/edit', { editInstructions: {} }, 404, 'photo_not_found'],
    ['GET', '/raw/999999', undefined, 404, 'photo_not_found'],
    ['GET', '/cache/thumbnail/nope', undefined, 404, 'file_not_found'],
    ['GET', '/cache/preview/nope', undefined, 404, 'file_not_found'],
    ['POST', '/export', { photoIds: [1] }, 400, 'export_params_required'],
    ['POST', '/creation/movie', { photoIds: [] }, 400, 'photo_ids_required'],
    ['POST', '/people', { name: '' }, 400, 'person_name_required'],
    ['PATCH', '/photos/999999', { isStarred: true }, 404, 'photo_not_found'],
    ['POST', '/albums', '{broken', 400, 'invalid_body'],
  ])('%s %s with %j responds %i %s', async (method, url, body, status, code) => {
    expect(await send(method, url, body)).toEqual({ status, body: { error: expect.any(String), code } });
  });
});
