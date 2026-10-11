import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase, startTestApp, TestClient } from '../auth/testing.js';
import { buildLibrary, type TestLibrary } from '../model/testLibrary.js';

let cleanup: () => void;
let app: Awaited<ReturnType<typeof startTestApp>>;
let client: TestClient;
let lib: TestLibrary;

beforeAll(async () => {
  let tmpDir: string;
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_model_routes_test_'));
  await (await import('../plugins/index.js')).pluginRegistry.init();
  app = await startTestApp();
  client = new TestClient(app.base);
  const photos: Record<string, { dateTaken: string }> = {};
  for (let i = 0; i < 230; i++) photos[`p${i}`] = { dateTaken: `2024-01-01T10:${String(i % 60).padStart(2, '0')}:00` };
  const keywords = Object.fromEntries(Object.keys(photos).map((stem) => [`${stem}.jpg`, { keywords: ['dawn'] }]));
  lib = await buildLibrary(path.join(tmpDir, 'photos'), {
    dawn: { photos, sidecar: { photos: keywords } },
    other: { photos: { x: {} } },
  });
});

afterAll(async () => {
  await app.close();
  cleanup();
});

const listing = (dir: string) => fs.readdirSync(dir).sort().map((name) => [name, fs.statSync(path.join(dir, name)).mtimeMs]);

describe('GET /api/objects', () => {
  it('pages the photos of a tag and counts all of them', async () => {
    const res = await client.get('/objects/photo?tag=dawn&limit=100&offset=200');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(30);
    expect(res.body.total).toBe(230);
    expect(res.body.items[0]).toMatchObject({ type: 'photo', tags: ['dawn'] });
  });

  it('refuses a limit over 500', async () => {
    const res = await client.get('/objects/photo?limit=5000');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'invalid_field', params: { field: 'limit' } });
  });

  it('refuses an unknown type', async () => {
    expect((await client.get('/objects/camera')).body).toMatchObject({ code: 'invalid_field', params: { field: 'type' } });
    const res = await client.get('/objects/camera/1');
    expect(res.status).toBe(400);
    expect(res.body.params).toEqual({ field: 'type' });
  });

  it('lists folders', async () => {
    const res = await client.get('/objects/folder');
    expect(res.body.items.map((item: { name: string }) => item.name)).toEqual(['dawn', 'other']);
    expect(res.body.total).toBe(2);
  });
});

describe('GET /api/objects/:type/:id', () => {
  it('responds with one document without changing any file', async () => {
    const before = listing(lib.dir.other);
    const res = await client.get(`/objects/photo/${lib.id.x}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'photo', id: lib.id.x, fileName: 'x.jpg' });
    expect(listing(lib.dir.other)).toEqual(before);
  });

  it('responds 404 for an unknown photo', async () => {
    const res = await client.get('/objects/photo/99999');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('object_not_found');
  });
});

describe('GET /api/schema', () => {
  it('responds with the JSON Schema of the model', async () => {
    const res = await client.get('/schema');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/schema+json');
    expect(res.body.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(Object.keys(res.body.$defs)).toEqual(expect.arrayContaining(['PhotoDocument', 'Changeset', 'EditStep']));
  });

  it('responds with the guide as Markdown', async () => {
    const res = await client.get('/schema/guide');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.body).toContain('# Paloma photo library');
    expect(res.body).toMatch(/- `sepia` — /);
  });
});

describe('POST /api/changes', () => {
  it('applies a changeset and responds with the results', async () => {
    const res = await client.post('/changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.x, set: { star: true, caption: 'Hi' } }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      dryRun: false,
      results: [{ index: 0, op: 'update', type: 'photo', ids: [lib.id.x], objects: [{ id: lib.id.x, changes: {
        star: { from: false, to: true }, caption: { from: null, to: 'Hi' },
      } }], more: 0 }],
    });
    expect(lib.readSidecar('other').photos['x.jpg']).toMatchObject({ star: true, caption: 'Hi' });
  });

  it('names the change and field of a read-only attribute', async () => {
    const res = await client.post('/changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.x, set: { fileName: 'new.jpg' } }] });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'read_only_field', params: { index: 0, field: 'fileName' } });
  });

  it('responds 404 naming the change with an unknown photo', async () => {
    const res = await client.post('/changes', { changes: [
      { op: 'update', type: 'photo', id: lib.id.x, set: { star: false } },
      { op: 'update', type: 'photo', id: 999999, set: { star: true } },
    ] });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'object_not_found', params: { index: 1, field: 'ids' } });
  });

  it('responds 409 for an unreadable sidecar', async () => {
    const file = path.join(lib.dir.other, '.paloma.json');
    const saved = fs.readFileSync(file);
    fs.writeFileSync(file, '{broken');
    try {
      const res = await client.post('/changes', { changes: [{ op: 'update', type: 'photo', id: lib.id.x, set: { star: false } }] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('sidecar_unreadable');
    } finally {
      fs.writeFileSync(file, saved);
    }
  });
});
