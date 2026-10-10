import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { eq } from 'drizzle-orm';

let tmpDir: string;
let api: typeof import('./faceDetectionApi.js');
let people: typeof import('./peopleApi.js');
let Sidecar: typeof import('./SidecarService.js').SidecarService;
let Scanner: typeof import('./FolderScannerService.js').FolderScannerService;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_detect_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  await (await import('../db/index.js')).openDatabase();
  api = await import('./faceDetectionApi.js');
  people = await import('./peopleApi.js');
  ({ SidecarService: Sidecar } = await import('./SidecarService.js'));
  ({ FolderScannerService: Scanner } = await import('./FolderScannerService.js'));
  await (await import('../plugins/index.js')).pluginRegistry.init();
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const ROY = 'b8e4117cf1d6615b';
const ROY_RECT = { left: 0.3, top: 0.1, right: 0.6, bottom: 0.5 };
const OTHER_RECT = { left: 0.65, top: 0.1, right: 0.9, bottom: 0.5 };
const DETECTOR = 'test-detector';
const ids: Record<string, number> = {};
let dirA: string;
let dirB: string;

function addFolder(name: string, files: string[]): string {
  const dir = path.join(tmpDir, `${name}_${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir);
  const folderId = db.insert(schema.folders).values({ path: dir, name, indexedAt: '' }).returning({ id: schema.folders.id }).get().id;
  for (const filename of files) {
    fs.writeFileSync(path.join(dir, filename), '');
    ids[filename] = db.insert(schema.photos)
      .values({ folderId, filename, fileHash: `hash-${filename}`, createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
  }
  return dir;
}

const writeSidecar = async (dir: string, photos: Record<string, unknown>) => {
  fs.writeFileSync(path.join(dir, '.paloma.json'), JSON.stringify({
    format: 'paloma-folder', version: 2, people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } }, photos,
  }));
  await Scanner.applyFolderState(dir, await Sidecar.getFolderState(dir));
};
const readSidecar = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, '.paloma.json'), 'utf-8'));

/** A descriptor near a point on the first axis: faces at the same `at` look alike. */
const descriptor = (at: number) => Array.from({ length: 128 }, (_, i) => (i === 0 ? at : 0));
const face = (rect: object, at: number) => ({ rect, score: 0.9, descriptor: descriptor(at) });

async function save(filename: string, faces: object[]): Promise<void> {
  const result = await api.saveDetectedFaces(ids[filename], { detector: DETECTOR, fileHash: `hash-${filename}`, faces });
  expect(result.status).toBe(200);
}

const faceIdsOf = (filename: string) =>
  db.select({ id: schema.detectedFaces.id }).from(schema.detectedFaces)
    .where(eq(schema.detectedFaces.photoId, ids[filename])).all().map((row) => row.id);

beforeEach(async () => {
  for (const table of [
    schema.faceDismissals, schema.detectedFaces, schema.faceDetections, schema.photoFaces, schema.photoPeople,
    schema.folderPeople, schema.persons, schema.photos, schema.folders,
  ]) db.delete(table).run();
  dirA = addFolder('a', ['a.jpg', 'b.jpg', 'c.jpg']);
  dirB = addFolder('b', ['d.jpg']);
  await writeSidecar(dirA, { 'a.jpg': { faces: [{ rect: ROY_RECT, person: ROY }] } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  fs.chmodSync(dirB, 0o755);
});

describe('pending photos', () => {
  it('lists photos not yet detected with this detector on their current content', async () => {
    await save('a.jpg', []);
    await api.saveDetectedFaces(ids['b.jpg'], { detector: 'old-detector', fileHash: 'hash-b.jpg', faces: [] });
    await save('c.jpg', []);
    db.update(schema.photos).set({ fileHash: 'changed' }).where(eq(schema.photos.id, ids['c.jpg'])).run();

    const result = await api.pendingPhotos({ photoIds: [ids['a.jpg'], ids['b.jpg'], ids['c.jpg'], ids['d.jpg'], 99999], detector: DETECTOR });

    expect(result.body).toEqual({ pending: [ids['b.jpg'], ids['c.jpg'], ids['d.jpg']] });
  });

  it('rejects a missing detector or photo list', async () => {
    expect((await api.pendingPhotos({ photoIds: [], detector: DETECTOR })).status).toBe(400);
    expect((await api.pendingPhotos({ photoIds: [ids['a.jpg']] })).status).toBe(400);
  });
});

describe('saving detected faces', () => {
  it('replaces the photo\'s previous faces and writes no files', async () => {
    const before = fs.readdirSync(dirA).sort();
    await save('b.jpg', [face(OTHER_RECT, 1), face(ROY_RECT, 2)]);
    await save('b.jpg', [face(OTHER_RECT, 1)]);

    expect(db.select().from(schema.detectedFaces).all()).toHaveLength(1);
    expect(fs.readdirSync(dirA).sort()).toEqual(before);
    expect(fs.existsSync(path.join(dirB, '.paloma.json'))).toBe(false);
  });

  it.each([
    [{ detector: DETECTOR, fileHash: 'hash-b.jpg', faces: [{ ...face(OTHER_RECT, 1), descriptor: [1, 2] }] }, 400],
    [{ detector: DETECTOR, fileHash: 'hash-b.jpg', faces: [{ ...face(OTHER_RECT, 1), score: 2 }] }, 400],
    [{ detector: DETECTOR, fileHash: 'hash-b.jpg', faces: [face({ left: 0.5, top: 0, right: 0.4, bottom: 1 }, 1)] }, 400],
    [{ detector: DETECTOR, fileHash: 'stale', faces: [] }, 409],
    [{ fileHash: 'hash-b.jpg', faces: [] }, 400],
  ])('rejects %j', async (body, status) => {
    expect((await api.saveDetectedFaces(ids['b.jpg'], body)).status).toBe(status);
  });
});

describe('similar faces', () => {
  it('says there is nothing to compare with without detected faces of the person', async () => {
    expect((await api.similarFaces(ROY, undefined)).body).toEqual({ noReference: true, faces: [] });
  });

  it('lists unassigned faces that look like the person, the most similar first', async () => {
    await save('a.jpg', [face(ROY_RECT, 0)]); // Roy's own face
    await save('b.jpg', [face(OTHER_RECT, 0.3)]);
    await save('c.jpg', [face(OTHER_RECT, 0.1), face(ROY_RECT, 2)]); // the second looks like someone else
    await save('d.jpg', [face(OTHER_RECT, 0.2)]);

    const result = (await api.similarFaces(ROY, undefined)).body as import('../../../shared/types.js').SimilarFaces;

    expect(result.noReference).toBe(false);
    expect(result.faces.map((f) => f.photoId)).toEqual([ids['c.jpg'], ids['d.jpg'], ids['b.jpg']]);
    expect(result.faces[0]).toEqual({ id: expect.any(Number), photoId: ids['c.jpg'], rect: OTHER_RECT, distance: expect.closeTo(0.1, 5) });
    expect(JSON.stringify(result)).not.toContain('descriptor');
  });

  it('leaves out hidden photos and faces dismissed for this person only', async () => {
    await save('a.jpg', [face(ROY_RECT, 0)]);
    await save('b.jpg', [face(OTHER_RECT, 0.1)]);
    await writeSidecar(dirA, { 'a.jpg': { faces: [{ rect: ROY_RECT, person: ROY }] }, 'c.jpg': { hidden: true } });
    await save('c.jpg', [face(OTHER_RECT, 0.1)]);
    const [faceB] = faceIdsOf('b.jpg');
    const ann = ((await people.createPerson({ name: 'Ann' })).body as { id: string }).id;

    expect((await api.dismissFaces(ROY, { faceIds: [faceB] })).status).toBe(200);

    expect(((await api.similarFaces(ROY, undefined)).body as { faces: unknown[] }).faces).toEqual([]);
    expect(db.select().from(schema.faceDismissals).all()).toEqual([{ faceId: faceB, contactId: ROY }]);
    expect((await api.dismissFaces(ann, { faceIds: [99999] })).status).toBe(404);
  });
});

describe('assigning faces', () => {
  it('writes each face with its rectangle and reports the faces of a folder that cannot be written', async () => {
    await save('a.jpg', [face(ROY_RECT, 0)]);
    await save('b.jpg', [face(OTHER_RECT, 0.1)]);
    await save('d.jpg', [face(OTHER_RECT, 0.1)]);
    const [faceB] = faceIdsOf('b.jpg');
    const [faceD] = faceIdsOf('d.jpg');
    fs.chmodSync(dirB, 0o555);

    const result = await api.assignFaces(ROY, { faceIds: [faceB, faceD] });

    expect(result.body).toEqual({ assigned: [faceB], failed: [faceD] });
    expect(readSidecar(dirA).photos['b.jpg'].faces).toEqual([{ rect: OTHER_RECT, person: ROY }]);
    const similar = (await api.similarFaces(ROY, undefined)).body as { faces: Array<{ id: number }> };
    expect(similar.faces.map((f) => f.id)).toEqual([faceD]);
    expect((await people.findPerson(ROY))!.photoCount).toBe(2);
  });

  it('rejects an unknown person or face', async () => {
    expect((await api.assignFaces('ffffffffffffff00', { faceIds: [1] })).status).toBe(404);
    expect((await api.assignFaces(ROY, { faceIds: [99999] })).status).toBe(404);
    expect((await api.assignFaces(ROY, {})).status).toBe(400);
  });
});

describe('unassigned faces', () => {
  it('counts and lists faces of no person on photos that are not hidden, newest photos first', async () => {
    db.update(schema.photos).set({ dateTaken: '2020-01-01' }).where(eq(schema.photos.id, ids['b.jpg'])).run();
    db.update(schema.photos).set({ dateTaken: '2021-01-01' }).where(eq(schema.photos.id, ids['d.jpg'])).run();
    await save('a.jpg', [face(ROY_RECT, 0), face(OTHER_RECT, 1)]); // the first is Roy's
    await save('b.jpg', [face(OTHER_RECT, 1)]);
    await save('d.jpg', [face(OTHER_RECT, 1)]);
    await writeSidecar(dirA, { 'a.jpg': { faces: [{ rect: ROY_RECT, person: ROY }] }, 'b.jpg': { hidden: true } });
    await save('c.jpg', [face(OTHER_RECT, 1)]);
    db.update(schema.photos).set({ dateTaken: '2019-01-01' }).where(eq(schema.photos.id, ids['c.jpg'])).run();

    const result = (await api.unassignedFaces(undefined)).body as import('../../../shared/types.js').UnassignedFaces;

    expect(result.total).toBe(3);
    expect(result.faces.map((f) => f.photoId)).toEqual([ids['d.jpg'], ids['c.jpg'], ids['a.jpg']]);
    expect(JSON.stringify(result)).not.toContain('descriptor');
    expect((await api.unassignedFaces('0')).body).toEqual({ total: 3, faces: [] });
    expect((await api.unassignedFaces('501')).status).toBe(400);
  });

  it('leaves out faces once they are assigned', async () => {
    await save('b.jpg', [face(OTHER_RECT, 1)]);
    await api.assignFaces(ROY, { faceIds: faceIdsOf('b.jpg') });
    expect(((await api.unassignedFaces(undefined)).body as { total: number }).total).toBe(0);
  });
});

describe('more faces than one batch', () => {
  const COUNT = 620;

  /** COUNT more photos in folder a with one detected face each, the i-th at distance i/2000 from Roy's face. */
  async function manyFaces(): Promise<{ photoIds: number[]; faceIds: number[] }> {
    const { encodeDescriptor } = await import('./faceMatch.js');
    await save('a.jpg', [face(ROY_RECT, 0)]);
    const folderId = db.select({ id: schema.photos.folderId }).from(schema.photos).where(eq(schema.photos.id, ids['a.jpg'])).get()!.id;
    const photoIds: number[] = [];
    const faceIds: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      const fileHash = `bulk-${i}`;
      const day = new Date(Date.UTC(2000, 0, 1) + i * 86_400_000).toISOString();
      const photoId = db.insert(schema.photos).values({
        folderId, filename: `bulk_${i}.jpg`, fileHash, createdAt: '', dateTaken: day, isHidden: i === 3,
      }).returning({ id: schema.photos.id }).get().id;
      db.insert(schema.faceDetections).values({ photoId, detector: DETECTOR, fileHash, detectedAt: '' }).run();
      faceIds.push(db.insert(schema.detectedFaces).values({
        photoId, rect: JSON.stringify(OTHER_RECT), score: 0.9, descriptor: encodeDescriptor(descriptor((i + 1) / 2000)),
      }).returning({ id: schema.detectedFaces.id }).get().id);
      photoIds.push(photoId);
    }
    return { photoIds, faceIds };
  }

  it('finds the most similar faces across batches, leaving out hidden photos and dismissed faces', async () => {
    const { faceIds } = await manyFaces();
    expect((await api.dismissFaces(ROY, { faceIds: [faceIds[5]] })).status).toBe(200);

    const result = await api.similarFaces(ROY, 10);
    expect(result.status).toBe(200);
    const expected = faceIds.filter((_, i) => i !== 3 && i !== 5).slice(0, 10);
    expect(result.body).toMatchObject({ noReference: false });
    expect((result.body as { faces: Array<{ id: number }> }).faces.map((f) => f.id)).toEqual(expected);
  });

  it('counts every unassigned face and lists the newest first across batches', async () => {
    const { faceIds } = await manyFaces();
    const result = await api.unassignedFaces(5);
    expect(result.status).toBe(200);
    const body = result.body as { total: number; faces: Array<{ id: number }> };
    // The bulk faces except the one on the hidden photo; Roy's face belongs to him
    expect(body.total).toBe(COUNT - 1);
    expect(body.faces.map((f) => f.id)).toEqual(faceIds.slice(-5).reverse());
    expect((await api.unassignedFaces(0)).body).toEqual({ total: COUNT - 1, faces: [] });
  });
});
