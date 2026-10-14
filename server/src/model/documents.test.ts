import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase } from '../auth/testing.js';
import { buildLibrary, type TestLibrary } from './testLibrary.js';

let tmpDir: string;
let cleanup: () => void;
let docs: typeof import('./documents.js');
let scope: typeof import('../auth/scope.js');
let lib: TestLibrary;

const ROY = 'b8e4117cf1d6615b';
const BIRDS = 'c9ea9fa67022f38a3c771894d2a8a468';
const RECT = { left: 0.1, top: 0.1, right: 0.3, bottom: 0.4 };

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_documents_test_'));
  docs = await import('./documents.js');
  scope = await import('../auth/scope.js');
});

afterAll(() => cleanup());

beforeEach(async () => {
  lib = await buildLibrary(fs.mkdtempSync(path.join(tmpDir, 'photos_')), {
    trip: {
      photos: { a: { dateTaken: '2024-05-09T12:00:00' }, b: { dateTaken: '2024-05-08T12:00:00' }, h: { isHidden: true } },
      sidecar: {
        albums: { [BIRDS]: { name: 'Birds', description: 'Spring migration' } },
        people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } },
        photos: {
          'a.jpg': {
            star: true, caption: 'Sunrise', keywords: ['dawn', 'hills'], geotag: { lat: 48.160833, lon: 24.500278 },
            albums: [BIRDS], faces: [{ person: ROY }], edits: [{ filter: 'sepia' }], modified: '2026-10-01T10:00:00.000Z',
          },
          'b.jpg': { keywords: ['Dawn'], albums: [BIRDS], faces: [{ person: ROY, rect: RECT }] },
          'h.jpg': { hidden: true, keywords: ['dawn'] },
        },
      },
    },
    home: { photos: { c: { dateTaken: '2023-01-01T10:00:00' } } },
  });
});

describe('photo documents', () => {
  it('shows every attribute of an edited and tagged photo', async () => {
    const doc = await docs.getDocument('photo', String(lib.id.a));
    expect(doc).toMatchObject({
      type: 'photo', id: lib.id.a, folder: { id: lib.folderId.trip, name: 'trip' }, fileName: 'a.jpg', width: 400, height: 300,
      takenAt: '2024-05-09T12:00:00', star: true, hidden: false, caption: 'Sunrise', tags: ['dawn', 'hills'],
      location: { lat: 48.160833, lon: 24.500278 }, locationSource: 'user',
      albums: [{ id: BIRDS, name: 'Birds' }], people: [{ id: ROY, name: 'Roy Avery', rect: null }], detectedFaces: [],
      edits: [{ filter: 'sepia' }], modified: true,
    });
  });

  it('shows an untouched photo with empty values', async () => {
    expect(await docs.getDocument('photo', String(lib.id.c))).toMatchObject({
      star: false, hidden: false, caption: null, tags: [], location: null, albums: [], people: [], edits: [], modified: false,
    });
  });

  it('lists unassigned detected faces only', async () => {
    const { db } = await import('../db/index.js');
    const schema = await import('../db/schema.js');
    db.insert(schema.faceDetections).values({ photoId: lib.id.b, detector: 'test', fileHash: 'hash-trip-b', detectedAt: '' }).run();
    const descriptor = Buffer.alloc(512);
    db.insert(schema.detectedFaces).values({ photoId: lib.id.b, rect: JSON.stringify(RECT), score: 1, descriptor }).run();
    const free = db.insert(schema.detectedFaces).values({
      photoId: lib.id.b, rect: JSON.stringify({ left: 0.6, top: 0.1, right: 0.8, bottom: 0.4 }), score: 1, descriptor,
    }).returning().get();
    const doc = await docs.getDocument('photo', String(lib.id.b));
    expect(doc).toMatchObject({ people: [{ id: ROY, rect: RECT }], detectedFaces: [{ id: free.id }] });
  });

  it('pages photos with the photo-list parameters and counts all matches', async () => {
    const page = await docs.listDocuments('photo', { tag: 'dawn' }, { limit: 1, offset: 1 });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual([lib.id.b]);
    expect((await docs.listDocuments('photo', { tag: 'dawn', includeHidden: 'true' }, { limit: 10, offset: 0 })).total).toBe(3);
  });

  it('does not find an unknown photo', async () => {
    expect(await docs.getDocument('photo', '999999')).toBeUndefined();
    expect(await docs.getDocument('photo', 'x')).toBeUndefined();
  });

  it('carries no server path', async () => {
    const doc = await docs.getDocument('photo', String(lib.id.a));
    expect(doc).toMatchObject({ folder: { id: lib.folderId.trip, name: 'trip' } });
    expect((doc as { folder: Record<string, unknown> }).folder).not.toHaveProperty('path');
    expect(JSON.stringify(doc)).not.toContain(lib.dir.trip);
  });

  it('lists a hidden photo as not found unless hidden photos are asked for', async () => {
    expect(await docs.getDocuments('photo', [lib.id.a, lib.id.h])).toMatchObject({ items: [{ id: lib.id.a }], notFound: [lib.id.h] });
    expect(await docs.getDocuments('photo', [lib.id.h], { includeHidden: true })).toMatchObject({ items: [{ id: lib.id.h, hidden: true }], notFound: [] });
  });
});

describe('other documents', () => {
  it('shows an album with its cover and count', async () => {
    expect(await docs.getDocument('album', BIRDS)).toEqual({
      type: 'album', id: BIRDS, name: 'Birds', date: null, description: 'Spring migration', location: null, cover: lib.id.a, photoCount: 2,
    });
  });

  it('shows a person and an unknown person', async () => {
    const { createPerson } = await import('../services/peopleApi.js');
    const unknown = await createPerson({});
    expect(unknown.status).toBe(200);
    const unknownId = (unknown.body as { id: string }).id;
    expect(await docs.getDocument('person', unknownId)).toEqual({
      type: 'person', id: unknownId, name: null, alias: null, comment: null, links: [], birth: null, gender: null, hasAvatar: false, photoCount: 0,
    });
    const people = await docs.listDocuments('person', {}, { limit: 10, offset: 0 });
    expect(people.items).toContainEqual(expect.objectContaining({ id: ROY, name: 'Roy Avery', hasAvatar: true, photoCount: 2 }));
  });

  it('shows folders and a tag spelled two ways once', async () => {
    const folders = await docs.listDocuments('folder', {}, { limit: 10, offset: 0 });
    expect(folders.items).toContainEqual({ type: 'folder', id: lib.folderId.home, name: 'home', photoCount: 1 });
    expect(JSON.stringify(folders.items)).not.toContain(lib.dir.home);
    const tags = await docs.listDocuments('tag', {}, { limit: 10, offset: 0 });
    // One photo each: the spelling that sorts first by code points is shown
    expect(tags.items).toContainEqual({ type: 'tag', id: 'Dawn', name: 'Dawn', photoCount: 2 });
    expect(await docs.getDocument('tag', 'DAWN')).toMatchObject({ name: 'Dawn' });
  });
});

describe('limited access', () => {
  it('shows only the folders and photos the user may see', async () => {
    const access = { all: false, folders: [lib.dir.home], albums: [] };
    await scope.runWithAccess(access as never, async () => {
      const folders = await docs.listDocuments('folder', {}, { limit: 10, offset: 0 });
      expect(folders.items.map((item) => item.id)).toEqual([lib.folderId.home]);
      expect(folders.total).toBe(1);
      expect(await docs.getDocument('photo', String(lib.id.a))).toBeUndefined();
      expect((await docs.listDocuments('photo', {}, { limit: 10, offset: 0 })).total).toBe(1);
    });
  });
});

describe('parsePaging', () => {
  it('defaults and limits', () => {
    expect(docs.parsePaging({})).toEqual({ limit: 100, offset: 0 });
    expect(docs.parsePaging({ limit: '5000' })).toEqual({ field: 'limit' });
    expect(docs.parsePaging({ offset: '-1' })).toEqual({ field: 'offset' });
  });
});
