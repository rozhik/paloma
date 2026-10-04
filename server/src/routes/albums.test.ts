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
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_routes_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  const { default: express } = await import('express');
  // Typed as the module under CommonJS interop; at runtime `default` is the router
  const router = (await import('./index.js')).default as unknown as import('express').Router;
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');

  const app = express();
  app.use(express.json());
  app.use('/api', router);
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

describe('album routes', () => {
  it('create, list, edit, remove photos (DELETE with a JSON body) and filter photos by album', async () => {
    const dir = path.join(tmpDir, 'photos');
    fs.mkdirSync(dir);
    const folderId = db.insert(schema.folders).values({ path: dir, name: 'photos', indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
    const photoIds = ['1.jpg', '2.jpg'].map((filename) => {
      fs.writeFileSync(path.join(dir, filename), '');
      return db.insert(schema.photos).values({ folderId, filename, fileHash: filename, createdAt: '' })
        .returning({ id: schema.photos.id }).get().id;
    });

    const created = await send('POST', '/albums', { name: 'Trip', photoIds });
    expect(created).toMatchObject({ status: 200, body: { name: 'Trip', photoCount: 2 } });
    const token = created.body.token;

    expect((await send('GET', '/albums')).body).toHaveLength(1);
    expect(await send('PATCH', `/albums/${token}`, { description: 'Summer' }))
      .toMatchObject({ status: 200, body: { description: 'Summer' } });

    expect(await send('DELETE', `/albums/${token}/photos`, { photoIds: [photoIds[0]] }))
      .toMatchObject({ status: 200, body: { photoCount: 1 } });
    expect((await send('GET', `/photos?album=${token}`)).body.map((p: { id: number }) => p.id)).toEqual([photoIds[1]]);

    expect(await send('DELETE', `/albums/${token}`)).toEqual({ status: 200, body: { success: true } });
    expect((await send('GET', '/albums')).body).toEqual([]);
    expect(await send('PATCH', '/albums/1', { name: 'x' }))
      .toEqual({ status: 404, body: { error: 'Album not found', code: 'album_not_found' } });
    expect(await send('POST', '/albums', { name: '', photoIds }))
      .toMatchObject({ status: 400, body: { code: 'album_name_required' } });
  });
});
