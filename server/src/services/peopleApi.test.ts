import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let api: typeof import('./peopleApi.js');
let photoInfo: typeof import('./photoInfo.js');
let photoApi: typeof import('./photoApi.js');
let Sidecar: typeof import('./SidecarService.js').SidecarService;
let Scanner: typeof import('./FolderScannerService.js').FolderScannerService;
let faceMatch: typeof import('./faceMatch.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_people_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  api = await import('./peopleApi.js');
  photoInfo = await import('./photoInfo.js');
  photoApi = await import('./photoApi.js');
  ({ SidecarService: Sidecar } = await import('./SidecarService.js'));
  ({ FolderScannerService: Scanner } = await import('./FolderScannerService.js'));
  faceMatch = await import('./faceMatch.js');
  await (await import('../plugins/index.js')).pluginRegistry.init();
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const ROY = 'b8e4117cf1d6615b';
const ROY_FACE = { rect: { left: 0.34, top: 0.13, right: 0.63, bottom: 0.88 }, person: ROY };
const ROY_NAMED = { people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } } };
const FACE_RECT = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 };

let dirA: string;
let dirB: string;
const ids: Record<string, number> = {};

/** A library folder with empty photo files, indexed from its files as the scanner would. */
function addFolder(name: string, files: string[]): string {
  const dir = path.join(tmpDir, `${name}_${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dir);
  const folderId = db.insert(schema.folders).values({ path: dir, name, indexedAt: '' }).returning({ id: schema.folders.id }).get().id;
  for (const filename of files) {
    fs.writeFileSync(path.join(dir, filename), '');
    ids[`${name}/${filename}`] = db.insert(schema.photos)
      .values({ folderId, filename, fileHash: `${name}/${filename}`, createdAt: '' })
      .returning({ id: schema.photos.id }).get().id;
  }
  return dir;
}

const writeSidecar = (dir: string, photos: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  fs.writeFileSync(path.join(dir, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, ...extra, photos }));
  Scanner.applyFolderState(dir, Sidecar.getFolderState(dir));
};
const readSidecar = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, '.paloma.json'), 'utf-8'));
const ok = <T>(result: { status: number; body: T | unknown }): T => {
  expect(result.status).toBe(200);
  return result.body as T;
};

/** Stores a detected face on the photo's current content and returns its id. */
function detect(photoId: number, rect = FACE_RECT, descriptor: number[] = new Array(128).fill(0)): number {
  const photo = db.select().from(schema.photos).all().find((p) => p.id === photoId)!;
  db.insert(schema.faceDetections).values({ photoId, detector: 'test', fileHash: photo.fileHash, detectedAt: '' })
    .onConflictDoNothing().run();
  return db.insert(schema.detectedFaces)
    .values({ photoId, rect: JSON.stringify(rect), score: 0.9, descriptor: faceMatch.encodeDescriptor(descriptor) })
    .returning({ id: schema.detectedFaces.id }).get().id;
}

beforeEach(() => {
  for (const table of [
    schema.faceDismissals, schema.detectedFaces, schema.faceDetections, schema.photoFaces, schema.photoPeople,
    schema.folderPeople, schema.persons, schema.edits, schema.albumPhotos, schema.photoKeywords, schema.photos, schema.folders,
  ]) db.delete(table).run();
  dirA = addFolder('a', ['a.jpg', 'b.jpg']);
  dirB = addFolder('b', ['c.jpg']);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.chmodSync(dirA, 0o755);
});

describe('people records', () => {
  it('creates an unknown person with a new contact id and writes no files', () => {
    const person = ok<import('../../../shared/types.js').Person>(api.createPerson({}));

    expect(person.id).toMatch(/^[0-9a-f]{16}$/);
    expect(person).toMatchObject({ name: null, photoCount: 0, links: [] });
    expect(fs.readdirSync(dirA).sort()).toEqual(['a.jpg', 'b.jpg']);
  });

  it('names an unknown person and then accepts the other profile fields', () => {
    const { id } = ok<{ id: string }>(api.createPerson({}));
    expect(api.updatePerson(id, { alias: 'Annie' }).status).toBe(400);

    ok(api.updatePerson(id, { name: 'Ann' }));
    const ann = ok<{ name: string; alias: string; links: string[]; birth: string; gender: string }>(
      api.updatePerson(id, { alias: 'Annie', links: ['https://example.com/ann'], birth: '1990-05-01', gender: 'female' }),
    );

    expect(ann).toMatchObject({ name: 'Ann', alias: 'Annie', links: ['https://example.com/ann'], birth: '1990-05-01', gender: 'female' });
    expect(api.listPeople()).toEqual([expect.objectContaining({ id, name: 'Ann', alias: 'Annie', photoCount: 0 })]);
  });

  it('shows the folder name until the person is edited in Paloma, then the Paloma name', () => {
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE] } }, { people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } } });
    expect(api.findPerson(ROY)).toMatchObject({ name: 'Roy Avery', photoCount: 1 });

    ok(api.updatePerson(ROY, { alias: 'Bear' }));
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE] } }, { people: { [ROY]: { name: 'Roy A.', email: null, googleId: null } } });

    expect(api.findPerson(ROY)).toMatchObject({ name: 'Roy Avery', alias: 'Bear' });
    expect(readSidecar(dirA).people[ROY].name).toBe('Roy A.');
  });

  it('rejects clearing the name of a known person', () => {
    const { id } = ok<{ id: string }>(api.createPerson({ name: 'Ann' }));
    expect(api.updatePerson(id, { name: '  ' })).toMatchObject({ status: 400, body: { code: 'person_name_required' } });
    expect(api.findPerson(id)!.name).toBe('Ann');
  });

  it('responds 404 for an unknown id', () => {
    expect(api.getPerson('ffffffffffffff00').status).toBe(404);
    expect(api.updatePerson('ffffffffffffff00', { name: 'x' }).status).toBe(404);
    expect(api.deletePerson('nothex').status).toBe(404);
  });

  it('counts photos that are not hidden', () => {
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE] }, 'b.jpg': { faces: [ROY_FACE], hidden: true } });
    writeSidecar(dirB, { 'c.jpg': { faces: [{ person: ROY }] } });

    expect(api.listPeople()).toEqual([expect.objectContaining({ id: ROY, name: null, photoCount: 2 })]);
  });

  it('never creates a new id equal to Picasa\'s ignored contact or an existing one', () => {
    const taken = new Set(['ffffffffffffffff']);
    const id = api.newContactId((candidate) => taken.has(candidate));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).not.toBe('ffffffffffffffff');
  });
});

describe('marks on a photo', () => {
  it('adds a person without a rectangle', () => {
    const { id: ann } = ok<{ id: string }>(api.createPerson({ name: 'Ann' }));

    const result = ok<{ people: Array<{ id: string; name: string }> }>(api.addPersonToPhoto(ids['a/a.jpg'], { person: ann }));

    expect(result.people).toEqual([expect.objectContaining({ id: ann, name: 'Ann', rects: [] })]);
    expect(readSidecar(dirA).photos['a.jpg']).toEqual({ faces: [{ person: ann }], modified: expect.any(String) });
  });

  it('changes nothing when the person is already on the photo', () => {
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE] } });
    const before = fs.readFileSync(path.join(dirA, '.paloma.json'), 'utf-8');

    ok(api.addPersonToPhoto(ids['a/a.jpg'], { person: ROY }));

    expect(fs.readFileSync(path.join(dirA, '.paloma.json'), 'utf-8')).toBe(before);
  });

  it('assigns a detected face with its rectangle, after which it is no longer unassigned', async () => {
    const { id: ann } = ok<{ id: string }>(api.createPerson({ name: 'Ann' }));
    const faceId = detect(ids['a/a.jpg']);
    expect((await photoInfo.getPhotoInfo(ids['a/a.jpg'], undefined)).body).toMatchObject({ faces: [{ id: faceId, rect: FACE_RECT }] });

    const result = ok<{ people: unknown[]; faces: unknown[] }>(api.addPersonToPhoto(ids['a/a.jpg'], { person: ann, faceId }));

    expect(readSidecar(dirA).photos['a.jpg'].faces).toEqual([{ rect: FACE_RECT, person: ann }]);
    expect(result.faces).toEqual([]);
    expect(result.people).toEqual([expect.objectContaining({ id: ann, rects: [FACE_RECT] })]);
    expect(api.getPhotoPeople(ids['a/a.jpg']).body).toEqual(result);
    expect(api.getPhotoPeople(99999).status).toBe(404);
  });

  it('rejects an unknown person, photo or face', () => {
    const { id: ann } = ok<{ id: string }>(api.createPerson({ name: 'Ann' }));
    expect(api.addPersonToPhoto(ids['a/a.jpg'], { person: 'ffffffffffffff00' }).status).toBe(404);
    expect(api.addPersonToPhoto(99999, { person: ann }).status).toBe(404);
    expect(api.addPersonToPhoto(ids['a/a.jpg'], { person: ann, faceId: 99999 })).toMatchObject({ status: 404, body: { code: 'face_not_found' } });
    expect(api.addPersonToPhoto(ids['a/a.jpg'], { person: 5 }).status).toBe(400);
  });

  it('fails in a read-only folder and leaves the library unchanged', () => {
    const { id: ann } = ok<{ id: string }>(api.createPerson({ name: 'Ann' }));
    fs.chmodSync(dirA, 0o555);

    expect(api.addPersonToPhoto(ids['a/a.jpg'], { person: ann }).status).toBe(500);
    expect(api.findPerson(ann)!.photoCount).toBe(0);
  });

  it('removes every face of a person and keeps ignored faces', () => {
    const ignored = { rect: FACE_RECT, ignored: true };
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE, ignored, { person: ROY }] } });

    const result = ok<{ people: unknown[] }>(api.removePersonFromPhoto(ids['a/a.jpg'], ROY));

    expect(result.people).toEqual([]);
    expect(readSidecar(dirA).photos['a.jpg']).toEqual({ faces: [ignored], modified: expect.any(String) });
  });

  it('makes a renamed person and a new mark searchable at once', () => {
    const { id: ann } = ok<{ id: string }>(api.createPerson({ name: 'Ann' }));
    ok(api.addPersonToPhoto(ids['b/c.jpg'], { person: ann }));
    ok(api.updatePerson(ann, { alias: 'Sunny' }));

    expect(photoApi.listPhotos({ query: 'sunny' }).map((p) => p.filename)).toEqual(['c.jpg']);
    expect(photoApi.listPhotos({ person: ann }).map((p) => p.filename)).toEqual(['c.jpg']);
  });
});

describe('photo info', () => {
  it('lists the people with their rectangles and only the detected faces that match no mark, without descriptors', async () => {
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE] } }, ROY_NAMED);
    detect(ids['a/a.jpg'], { left: 0.35, top: 0.13, right: 0.63, bottom: 0.87 });
    const free = detect(ids['a/a.jpg']);

    const info = (await photoInfo.getPhotoInfo(ids['a/a.jpg'], undefined)).body as import('../../../shared/types.js').PhotoInfo;

    expect(info.people).toEqual([{ id: ROY, name: 'Roy Avery', avatarVersion: expect.any(String), rects: [ROY_FACE.rect] }]);
    expect(info.faces).toEqual([{ id: free, photoId: ids['a/a.jpg'], rect: FACE_RECT }]);
    expect(JSON.stringify(info)).not.toContain('descriptor');
  });

  it('ignores faces detected on an earlier version of the file', async () => {
    detect(ids['a/a.jpg']);
    db.update(schema.photos).set({ fileHash: 'changed' }).run();

    const info = (await photoInfo.getPhotoInfo(ids['a/a.jpg'], undefined)).body as import('../../../shared/types.js').PhotoInfo;
    expect(info.faces).toEqual([]);
  });
});

describe('deleting a person', () => {
  it('removes their faces in every folder and keeps the people definitions', () => {
    const people = { [ROY]: { name: 'Roy Avery', email: null, googleId: null } };
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE], star: true } }, { people });
    writeSidecar(dirB, { 'c.jpg': { faces: [{ person: ROY }] } });

    ok(api.deletePerson(ROY));

    expect(readSidecar(dirA).photos['a.jpg']).toEqual({ star: true, modified: expect.any(String) });
    expect(readSidecar(dirA).people).toEqual(people);
    expect(readSidecar(dirB).photos).toEqual({});
    expect(api.listPeople()).toEqual([]);
  });

  it('keeps the person when a folder cannot be written', () => {
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE] } });
    writeSidecar(dirB, { 'c.jpg': { faces: [{ person: ROY }] } });
    fs.chmodSync(dirA, 0o555);

    expect(api.deletePerson(ROY).status).toBe(500);
    expect(api.findPerson(ROY)).toMatchObject({ photoCount: 1 });
  });

  it('deletes a person who is on no photo without changing files', () => {
    const { id } = ok<{ id: string }>(api.createPerson({ name: 'Ann' }));
    ok(api.deletePerson(id));
    expect(api.findPerson(id)).toBeUndefined();
    expect(fs.existsSync(path.join(dirA, '.paloma.json'))).toBe(false);
  });
});

describe('avatar', () => {
  it('is the first face with a rectangle, a chosen face, and falls back when the chosen face goes', () => {
    const other = { rect: FACE_RECT, person: ROY };
    writeSidecar(dirA, { 'a.jpg': { faces: [ROY_FACE] }, 'b.jpg': { faces: [other] } }, ROY_NAMED);
    const first = api.findPerson(ROY)!.avatarVersion;
    expect(first).toEqual(expect.any(String));
    expect(ok<Array<{ photoId: number }>>(api.listPersonFaces(ROY)).map((f) => f.photoId)).toEqual([ids['a/a.jpg'], ids['a/b.jpg']]);

    const chosen = ok<{ avatarVersion: string; avatar: unknown }>(
      api.updatePerson(ROY, { avatar: { photoId: ids['a/b.jpg'], rect: FACE_RECT } }),
    );
    expect(chosen.avatar).toEqual({ photoId: ids['a/b.jpg'], rect: FACE_RECT });
    expect(chosen.avatarVersion).not.toBe(first);

    ok(api.removePersonFromPhoto(ids['a/b.jpg'], ROY));
    expect(api.findPerson(ROY)).toMatchObject({ avatarVersion: first, avatar: null });
  });

  it('rejects a face that is not the person\'s and has none without rectangles', async () => {
    writeSidecar(dirA, { 'a.jpg': { faces: [{ person: ROY }] } }, ROY_NAMED);
    expect(api.findPerson(ROY)!.avatarVersion).toBeNull();
    const { personAvatar } = await import('./faceImages.js');
    expect((await personAvatar(ROY)).status).toBe(404);
    expect((await personAvatar('ffffffffffffff00')).status).toBe(404);
    expect(api.updatePerson(ROY, { avatar: { photoId: ids['a/a.jpg'], rect: FACE_RECT } }))
      .toMatchObject({ status: 400, body: { params: { field: 'avatar' } } });
  });
});
