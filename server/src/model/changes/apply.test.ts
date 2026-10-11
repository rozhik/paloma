import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase } from '../../auth/testing.js';
import { buildLibrary, type TestLibrary } from '../testLibrary.js';
import type { ChangesetResponse, PalomaFolderFile } from '../../../../shared/types.js';

let tmpDir: string;
let cleanup: () => void;
let changes: typeof import('./apply.js');
let OFF: typeof import('../../auth/principal.js').OFF_PRINCIPAL;
let lib: TestLibrary;

const ROY = 'b8e4117cf1d6615b';
const BIRDS = 'c9ea9fa67022f38a3c771894d2a8a468';
const RECT = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 };

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_apply_test_'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await (await import('../../plugins/index.js')).pluginRegistry.init();
  changes = await import('./apply.js');
  ({ OFF_PRINCIPAL: OFF } = await import('../../auth/principal.js'));
});

afterAll(() => cleanup());

beforeEach(async () => {
  lib = await buildLibrary(fs.mkdtempSync(path.join(tmpDir, 'photos_')), {
    a: {
      photos: { p1: { dateTaken: '2024-01-02' }, p2: { dateTaken: '2024-01-01' } },
      sidecar: {
        albums: { [BIRDS]: { name: 'Birds' } },
        people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } },
        photos: { 'p1.jpg': { albums: [BIRDS], faces: [{ person: ROY }] } },
      },
    },
    b: { photos: { p3: {}, p4: {} } },
  });
});

afterEach(() => {
  for (const dir of Object.values(lib.dir)) fs.chmodSync(dir, 0o755);
});

const run = (body: unknown) => changes.runChangeset(body, OFF);
async function applied(body: unknown): Promise<ChangesetResponse> {
  const result = await run(body);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as ChangesetResponse;
}
const entry = (folder: string, file: string) => lib.readSidecar(folder).photos[file];
const snapshot = (folder: string) => (lib.hasSidecar(folder) ? fs.readFileSync(path.join(lib.dir[folder], '.paloma.json'), 'utf-8') : null);

describe('applying changesets', () => {
  it('writes caption, tags and location as the sidecar fields', async () => {
    await applied({ changes: [{ op: 'update', type: 'photo', id: lib.id.p3, set: {
      caption: 'Sunrise', tags: ['dawn', '', 'Dawn', 'hills'], location: { lat: 49.8397, lon: 24.0297 },
    } }] });
    expect(entry('b', 'p3.jpg')).toMatchObject({ caption: 'Sunrise', keywords: ['dawn', 'hills'], geotag: { lat: 49.8397, lon: 24.0297 }, modified: expect.any(String) });
  });

  it('leaves the edits unchanged for an invalid step', async () => {
    const result = await run({ changes: [{ op: 'update', type: 'photo', id: lib.id.p3, set: { edits: [{ filter: 'brightness', amount: 500 }] } }] });
    expect(result.status).toBe(400);
    expect(lib.hasSidecar('b')).toBe(false);
  });

  it('creates an album and returns its token', async () => {
    const body = await applied({ changes: [{ op: 'create', type: 'album', set: { name: 'Trip', photos: [lib.id.p2, lib.id.p3] } }] });
    const token = body.results[0].ids[0] as string;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(lib.readSidecar('a').albums![token]).toMatchObject({ name: 'Trip' });
    expect(entry('b', 'p3.jpg').albums).toEqual([token]);
  });

  it('refuses an album without photos', async () => {
    expect((await run({ changes: [{ op: 'create', type: 'album', set: { name: 'Empty', photos: [] } }] })).status).toBe(400);
  });

  it('puts a new person on photos through a ref', async () => {
    const body = await applied({ changes: [
      { op: 'create', type: 'person', ref: 'ann', set: { name: 'Ann' } },
      { op: 'update', type: 'photo', ids: [lib.id.p3, lib.id.p4], set: { people: { add: ['@ann'] } } },
    ] });
    const ann = body.results[0].ids[0] as string;
    expect(ann).toMatch(/^[0-9a-f]{16}$/);
    expect(body.results[1].objects[0].changes.people.to).toEqual([{ id: ann, rect: null }]);
    expect(entry('b', 'p3.jpg').faces).toEqual([{ person: ann }]);
    expect(entry('b', 'p4.jpg').faces).toEqual([{ person: ann }]);
  });

  it('assigns a detected face with its rectangle', async () => {
    const { db } = await import('../../db/index.js');
    const schema = await import('../../db/schema.js');
    db.insert(schema.faceDetections).values({ photoId: lib.id.p3, detector: 't', fileHash: 'hash-b-p3', detectedAt: '' }).run();
    const face = db.insert(schema.detectedFaces).values({ photoId: lib.id.p3, rect: JSON.stringify(RECT), score: 1, descriptor: Buffer.alloc(512) }).returning().get();
    await applied({ changes: [{ op: 'update', type: 'photo', id: lib.id.p3, set: { people: { add: [{ person: ROY, face: face.id }] } } }] });
    expect(entry('b', 'p3.jpg').faces).toEqual([{ rect: RECT, person: ROY }]);
  });

  it('removes the faces of a deleted person', async () => {
    await applied({ changes: [{ op: 'delete', type: 'person', id: ROY }] });
    expect(entry('a', 'p1.jpg').faces).toBeUndefined();
  });

  it('writes nothing when a sidecar is unreadable', async () => {
    fs.writeFileSync(path.join(lib.dir.a, '.paloma.json'), '{broken');
    const result = await run({ changes: [{ op: 'update', type: 'photo', ids: [lib.id.p2, lib.id.p3], set: { star: true } }] });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: 'sidecar_unreadable', failedFolders: [lib.dir.a] });
    expect(lib.hasSidecar('b')).toBe(false);
  });

  it('keeps the folders written before one that cannot be written', async () => {
    fs.chmodSync(lib.dir.b, 0o555);
    const result = await run({ changes: [{ op: 'update', type: 'photo', ids: [lib.id.p2, lib.id.p3], set: { star: true } }] });
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ code: 'sidecar_write_failed', notChangedFolders: [lib.dir.b], params: { index: 0 } });
    expect(entry('a', 'p2.jpg').star).toBe(true);
  });

  it('writes the same entry fields as PATCH /api/photos/:id', async () => {
    const { updatePhoto } = await import('../../services/photoApi.js');
    await applied({ changes: [{ op: 'update', type: 'photo', id: lib.id.p3, set: { caption: 'Same', tags: ['x', 'y'] } }] });
    expect((await updatePhoto(lib.id.p4, { caption: 'Same', keywords: ['x', 'y'] })).status).toBe(200);
    const { modified: m3, ...p3 } = entry('b', 'p3.jpg');
    const { modified: m4, ...p4 } = entry('b', 'p4.jpg');
    expect(m3 && m4).toBeTruthy();
    expect(p3).toEqual(p4);
  });

  it('gives the same results in a dry run, and writes nothing', async () => {
    const body = { changes: [
      { op: 'update', type: 'photo', ids: [lib.id.p1, lib.id.p3], set: { star: true, tags: { add: ['sea'] } } },
      { op: 'update', type: 'album', id: BIRDS, set: { description: 'Spring' } },
    ] };
    const before = [snapshot('a'), snapshot('b')];
    const dry = await applied({ ...body, dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect([snapshot('a'), snapshot('b')]).toEqual(before);
    const real = await applied(body);
    expect(real.results).toEqual(dry.results);
    expect(entry('b', 'p3.jpg')).toMatchObject({ star: true, keywords: ['sea'] });
  });

  it('does not rewrite an entry whose values do not change', async () => {
    await applied({ changes: [{ op: 'update', type: 'photo', id: lib.id.p2, set: { star: true } }] });
    const first = entry('a', 'p2.jpg').modified;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const body = await applied({ changes: [{ op: 'update', type: 'photo', ids: [lib.id.p2, lib.id.p1], set: { star: true } }] });
    expect(body.results[0].objects.map((object) => object.id)).toEqual([lib.id.p1]);
    expect(entry('a', 'p2.jpg').modified).toBe(first);
  });

  it('removes a photo from an album and edits the album in one changeset', async () => {
    const body = await applied({ changes: [
      { op: 'update', type: 'photo', id: lib.id.p3, set: { albums: { add: [BIRDS] } } },
      { op: 'update', type: 'album', id: BIRDS, set: { name: 'Birds of Ukraine', cover: lib.id.p3 } },
      { op: 'update', type: 'photo', id: lib.id.p1, set: { albums: [] } },
    ] });
    expect(body.results.map((result) => result.objects.length)).toEqual([1, 1, 1]);
    const b = lib.readSidecar('b') as PalomaFolderFile;
    expect(b.albums![BIRDS]).toMatchObject({ name: 'Birds of Ukraine', cover: 'p3.jpg' });
    expect(entry('a', 'p1.jpg').albums).toBeUndefined();
  });
});
