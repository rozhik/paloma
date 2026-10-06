import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
let photoApi: typeof import('./photoApi.js');
let tagApi: typeof import('./tagApi.js');
let people: typeof import('./people.js');
let libraryText: typeof import('./libraryText.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_text_api_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  photoApi = await import('./photoApi.js');
  tagApi = await import('./tagApi.js');
  people = await import('./people.js');
  libraryText = await import('./libraryText.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const folderIds: Record<string, number> = {};

beforeEach(() => {
  for (const table of [
    schema.photoKeywords, schema.photoPeople, schema.albumPhotos, schema.folderAlbums, schema.folderPeople,
    schema.geoPlaces, schema.photos, schema.folders,
  ]) db.delete(table).run();
  for (const name of ['/photos/a', '/photos/b']) {
    folderIds[name] = db.insert(schema.folders).values({ path: name, name: path.basename(name), indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
  }
});

interface Seed {
  folder?: string;
  caption?: string;
  keywords?: string[];
  model?: string;
  hidden?: boolean;
  albums?: string[];
  people?: string[];
  geoCell?: string;
}

/** A library photo as the scanner would index it. */
function addPhoto(filename: string, seed: Seed = {}): number {
  const folder = seed.folder ?? '/photos/a';
  const { caption, keywords, searchText } = libraryText.effectiveText(
    { caption: seed.caption, keywords: seed.keywords },
    { filename, folderPath: folder, embeddedCaption: null, embeddedKeywords: [], cameraMake: null, cameraModel: seed.model ?? null },
  );
  const id = db.insert(schema.photos).values({
    folderId: folderIds[folder], filename, fileHash: filename, createdAt: '', isHidden: seed.hidden ?? false,
    caption, keywords: keywords.length ? JSON.stringify(keywords) : null, searchText, geoCell: seed.geoCell ?? null,
  }).returning({ id: schema.photos.id }).get().id;
  for (const keyword of keywords) db.insert(schema.photoKeywords).values({ photoId: id, keyword, key: keyword.toLowerCase() }).run();
  for (const token of seed.albums ?? []) db.insert(schema.albumPhotos).values({ photoId: id, token }).run();
  (seed.people ?? []).forEach((contactId, position) => db.insert(schema.photoPeople).values({ photoId: id, contactId, position }).run());
  return id;
}

const defineAlbum = (folder: string, token: string, name: string, description: string | null = null) =>
  db.insert(schema.folderAlbums).values({ folderId: folderIds[folder], token, name, description }).run();
const definePerson = (folder: string, contactId: string, name: string | null) =>
  db.insert(schema.folderPeople).values({ folderId: folderIds[folder], contactId, name }).run();

const ROY = 'b8e4117cf1d6615b';

describe('people', () => {
  it('takes a name defined only in another folder', () => {
    const id = addPhoto('a.jpg', { people: [ROY] });
    definePerson('/photos/a', ROY, null);
    definePerson('/photos/b', ROY, 'Roy Avery');

    expect(people.peopleOnPhoto(id)).toEqual([{ id: ROY, name: 'Roy Avery' }]);
  });

  it('prefers the first folder by path and gives null for an unknown contact', () => {
    definePerson('/photos/b', ROY, 'Roy B');
    definePerson('/photos/a', ROY, 'Roy A');
    expect(people.personNames([ROY, '0123456789abcdef'])).toEqual(new Map([[ROY, 'Roy A'], ['0123456789abcdef', null]]));
  });
});

describe('tags', () => {
  it('groups spellings under the most used one and counts photos', () => {
    addPhoto('1.jpg', { keywords: ['Dawn'] });
    addPhoto('2.jpg', { keywords: ['Dawn', 'hills'] });
    addPhoto('3.jpg', { keywords: ['dawn'] });

    expect(tagApi.listTags()).toEqual([{ name: 'Dawn', photoCount: 3 }, { name: 'hills', photoCount: 1 }]);
  });

  it('breaks a tie by code-point order', () => {
    addPhoto('1.jpg', { keywords: ['dawn'] });
    addPhoto('2.jpg', { keywords: ['Dawn'] });
    expect(tagApi.listTags()).toEqual([{ name: 'Dawn', photoCount: 2 }]);
  });

  it('leaves out a tag only on hidden photos', () => {
    addPhoto('1.jpg', { keywords: ['secret'], hidden: true });
    expect(tagApi.listTags()).toEqual([]);
  });

  it('filters photos by tag ignoring case, combined with an album', () => {
    const a = addPhoto('1.jpg', { keywords: ['Dawn'], albums: ['c9ea'] });
    const b = addPhoto('2.jpg', { keywords: ['dawn'] });
    addPhoto('3.jpg', { keywords: ['dusk'] });

    expect(photoApi.listPhotos({ tag: 'DAWN' }).map((p) => p.id).sort()).toEqual([a, b].sort());
    expect(photoApi.listPhotos({ tag: 'dawn', album: 'c9ea' }).map((p) => p.id)).toEqual([a]);
  });
});

describe('search', () => {
  const found = (query: string, extra: Record<string, string> = {}) =>
    photoApi.listPhotos({ query, ...extra }).map((p) => p.filename).sort();

  it('needs every word, in any of the texts, ignoring case', () => {
    addPhoto('a.jpg', { folder: '/photos/b', keywords: ['bridge'] });
    addPhoto('c.jpg', { keywords: ['bridge'] });

    expect(found('photos/b BRIDGE')).toEqual(['a.jpg']);
    expect(found('bridge river')).toEqual([]);
    expect(found('   ')).toEqual(['a.jpg', 'c.jpg']);
  });

  it('matches part of a word and Cyrillic in another case', () => {
    addPhoto('a.jpg', { caption: 'Sunrise over hills', keywords: ['Київ'] });
    expect(found('rise')).toEqual(['a.jpg']);
    expect(found('київ')).toEqual(['a.jpg']);
  });

  it('finds album names and descriptions, people and camera models', () => {
    addPhoto('a.jpg', { albums: ['c9ea'] });
    addPhoto('b.jpg', { people: [ROY] });
    addPhoto('c.jpg', { model: 'Canon EOS 80D' });
    defineAlbum('/photos/a', 'c9ea', 'Birds of Ukraine', 'Spring migration');
    definePerson('/photos/a', ROY, 'Roy Avery');

    expect(found('birds')).toEqual(['a.jpg']);
    expect(found('migration')).toEqual(['a.jpg']);
    expect(found('avery')).toEqual(['b.jpg']);
    expect(found('80d')).toEqual(['c.jpg']);
  });

  it('finds place names', () => {
    addPhoto('a.jpg', { geoCell: '4816:2450' });
    db.insert(schema.geoPlaces).values({ cell: '4816:2450', lang: 'uk', name: 'Яремче', searchText: 'яремче', status: 'ok', updatedAt: '' }).run();
    expect(found('ЯРЕМЧЕ')).toEqual(['a.jpg']);
  });

  it('treats % and _ literally', () => {
    addPhoto('a_b.jpg');
    addPhoto('axb.jpg');
    expect(found('a_b')).toEqual(['a_b.jpg']);
    expect(found('%')).toEqual([]);
  });

  it('does not find a removed embedded description', () => {
    const { searchText } = libraryText.effectiveText({ caption: '' }, {
      filename: 'a.jpg', folderPath: '/photos/a', embeddedCaption: 'Market day', embeddedKeywords: [], cameraMake: null, cameraModel: null,
    });
    expect(searchText).not.toContain('market');
  });

  it('searches inside an album and leaves hidden photos out', () => {
    addPhoto('a.jpg', { keywords: ['bridge'], albums: ['trip'] });
    addPhoto('b.jpg', { keywords: ['bridge'] });
    addPhoto('c.jpg', { keywords: ['bridge'], albums: ['trip'], hidden: true });

    expect(found('bridge', { album: 'trip' })).toEqual(['a.jpg']);
  });
});
