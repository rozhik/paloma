import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { LibraryAccess } from '../../../shared/types.js';
import { openTestDatabase } from './testing.js';

let cleanup: () => void;
let scope: typeof import('./scope.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');
const ids: Record<string, number> = {};

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_scope_test_'));
  scope = await import('./scope.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  // /photos/2023/a, /photos/2024/b, /photos/2024/summer/c, /photos/2024x/d (a sibling sharing the prefix)
  for (const [folder, file] of [['/photos/2023', 'a'], ['/photos/2024', 'b'], ['/photos/2024/summer', 'c'], ['/photos/2024x', 'd']]) {
    const folderId = db.insert(schema.folders).values({ path: folder, name: folder, indexedAt: '' }).returning().get().id;
    ids[file] = db.insert(schema.photos).values({ folderId, filename: `${file}.jpg`, fileHash: `hash-${file}`, createdAt: '' }).returning().get().id;
  }
  db.insert(schema.albumPhotos).values({ photoId: ids.a, token: 'trip' }).run();
});

afterAll(() => cleanup());

const visible = (access: LibraryAccess) => {
  const where = scope.visiblePhotoCondition(access);
  return db.select({ filename: schema.photos.filename }).from(schema.photos).where(where).all().map((row) => row.filename).sort();
};

describe('visiblePhotoCondition', () => {
  it('shows everything with whole-library access', () => {
    expect(scope.visiblePhotoCondition({ all: true })).toBeUndefined();
  });

  it('includes subfolders of a granted folder, but not siblings sharing its prefix', () => {
    expect(visible({ all: false, folders: ['/photos/2024'], albums: [] })).toEqual(['b.jpg', 'c.jpg']);
  });

  it('shows the photos of granted albums', () => {
    expect(visible({ all: false, folders: [], albums: ['trip'] })).toEqual(['a.jpg']);
    expect(visible({ all: false, folders: ['/photos/2024x'], albums: ['trip'] })).toEqual(['a.jpg', 'd.jpg']);
  });

  it('shows nothing without grants', () => {
    expect(visible({ all: false, folders: [], albums: [] })).toEqual([]);
  });
});

describe('single photos and file hashes', () => {
  const limited: LibraryAccess = { all: false, folders: ['/photos/2024'], albums: [] };

  it('tells visible photos apart', async () => {
    expect(await scope.isPhotoVisible(ids.c, limited)).toBe(true);
    expect(await scope.isPhotoVisible(ids.a, limited)).toBe(false);
    expect(await scope.isFileHashVisible('hash-b', limited)).toBe(true);
    expect(await scope.isFileHashVisible('hash-d', limited)).toBe(false);
  });

  it('uses the access of the current request', async () => {
    expect(await scope.isPhotoVisible(ids.a)).toBe(true);
    await scope.runWithAccess(limited, async () => {
      await Promise.resolve();
      expect(await scope.isPhotoVisible(ids.a)).toBe(false);
      expect(scope.currentAccess()).toBe(limited);
    });
  });
});

describe('folderGranted and albumGranted', () => {
  it('match granted folders with subfolders and granted albums', () => {
    const access: LibraryAccess = { all: false, folders: ['/photos/2024'], albums: ['trip'] };
    expect(scope.folderGranted('/photos/2024/summer', access)).toBe(true);
    expect(scope.folderGranted('/photos/2024x', access)).toBe(false);
    expect(scope.folderGranted('/photos', access)).toBe(false);
    expect(scope.albumGranted('trip', access)).toBe(true);
    expect(scope.albumGranted('other', access)).toBe(false);
    expect(scope.albumGranted('other', { all: true })).toBe(true);
  });
});
