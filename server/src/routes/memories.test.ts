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
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_memory_routes_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  await (await import('../db/index.js')).openDatabase();
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

/** Names of the files in a folder with their modification times. */
const snapshot = (dir: string) => fs.readdirSync(dir).sort().map((name) => [name, fs.statSync(path.join(dir, name)).mtimeMs]);

describe('memory routes', () => {
  it('lists memories that follow hiding and album changes, and opens one by its range without writing files', async () => {
    const dir = path.join(tmpDir, 'photos');
    fs.mkdirSync(dir);
    const folderId = db.insert(schema.folders).values({ path: dir, name: 'photos', indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
    const photoIds = ['2016-10-04', '2016-10-06', '2016-10-09', '2016-10-09', '2016-10-10'].map((day, i) => {
      const filename = `${i}.jpg`;
      fs.writeFileSync(path.join(dir, filename), '');
      return db.insert(schema.photos)
        .values({ folderId, filename, fileHash: filename, createdAt: '', dateTaken: `${day}T12:00:00.000Z` })
        .returning({ id: schema.photos.id }).get().id;
    });

    const before = snapshot(dir);
    const listed = await send('GET', '/memories?date=2026-10-06');
    expect(listed).toMatchObject({
      status: 200,
      body: [{ year: 2016, yearsAgo: 10, from: '2016-10-03', to: '2016-10-09', photoCount: 4, album: null, title: null }],
    });
    const [memory] = listed.body;
    const opened = await send('GET', `/photos?takenFrom=${memory.from}&takenTo=${memory.to}`);
    expect(opened.body.map((p: { id: number }) => p.id).sort()).toEqual(photoIds.slice(0, 4).sort());
    expect(snapshot(dir)).toEqual(before);
    expect((await send('GET', '/albums')).body).toEqual([]);

    // Album changes: an album holding every photo of the memory names it
    const created = await send('POST', '/albums', { name: 'Kyiv', photoIds: photoIds.slice(0, 4) });
    expect((await send('GET', '/memories?date=2026-10-06')).body[0].album)
      .toEqual({ token: created.body.token, name: 'Kyiv' });

    // Hiding photos: under three left, so no memory
    for (const id of photoIds.slice(0, 2)) expect((await send('PATCH', `/photos/${id}`, { isHidden: true })).status).toBe(200);
    expect(await send('GET', '/memories?date=2026-10-06')).toEqual({ status: 200, body: [] });
  });

  it.each(['', '?date=2026-13-40', '?date=06.10.2026'])('rejects GET /memories%s with 400', async (query) => {
    expect(await send('GET', `/memories${query}`)).toMatchObject({ status: 400, body: { code: 'invalid_date' } });
  });
});
