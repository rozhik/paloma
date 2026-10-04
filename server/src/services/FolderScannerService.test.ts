import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';

// config.ts and db/index.ts read the environment at import time, so the modules are
// imported dynamically after the PALOMA_* variables point at a temp folder.
let tmpDir: string;
let photosRoot: string;
let Scanner: typeof import('./FolderScannerService.js').FolderScannerService;
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

async function makeImage(filePath: string, width = 40, height = 30): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg()
    .toFile(filePath);
}

function indexedPaths(): string[] {
  return db.select({ filename: schema.photos.filename, folder: schema.folders.path })
    .from(schema.photos)
    .innerJoin(schema.folders, eq(schema.photos.folderId, schema.folders.id))
    .all()
    .map((row) => path.join(row.folder, row.filename))
    .sort();
}

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_scanner_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');

  ({ FolderScannerService: Scanner } = await import('./FolderScannerService.js'));
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

beforeEach(() => {
  photosRoot = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
  for (const table of [
    schema.edits, schema.faceAnnotations, schema.photoTags, schema.albumPhotos,
    schema.albums, schema.photos, schema.folders,
  ]) {
    db.delete(table).run();
  }
});

afterEach(async () => {
  await Scanner.stopAll();
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Creates the image outside the watched tree and moves it in, so watchers see a complete file.
async function dropImage(filePath: string): Promise<void> {
  const staging = path.join(tmpDir, `staging_${Date.now()}_${Math.random()}.jpg`);
  await makeImage(staging);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.renameSync(staging, filePath);
}

const WAIT = { timeout: 10000, interval: 50 };

describe('FolderScannerService', () => {
  it('indexes a photo from a scanned folder', async () => {
    await makeImage(path.join(photosRoot, 'a.jpg'));

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(indexedPaths()).toEqual([path.join(photosRoot, 'a.jpg')]);
  });

  it('scans recursively and registers each directory with photos as its own folder', async () => {
    const nested = path.join(photosRoot, '2024', 'trip');
    await makeImage(path.join(photosRoot, 'top.jpg'));
    await makeImage(path.join(nested, 'img.jpg'));

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(indexedPaths()).toHaveLength(2);
    const folder = db.select().from(schema.folders).where(eq(schema.folders.path, nested)).get();
    expect(folder?.name).toBe('trip');
    const inFolder = db.select().from(schema.photos).where(eq(schema.photos.folderId, folder!.id)).all();
    expect(inFolder.map((p) => p.filename)).toEqual(['img.jpg']);
  });

  it('indexes supported extensions in any case and ignores other files', async () => {
    await makeImage(path.join(photosRoot, 'IMG_001.JPG'));
    await makeImage(path.join(photosRoot, 'b.jpeg'));
    fs.writeFileSync(path.join(photosRoot, 'notes.txt'), 'hello');
    fs.writeFileSync(path.join(photosRoot, 'clip.mp4'), 'not a video');

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(indexedPaths()).toEqual([
      path.join(photosRoot, 'IMG_001.JPG'),
      path.join(photosRoot, 'b.jpeg'),
    ]);
  });

  it('skips hidden folders, node_modules and excluded folders', async () => {
    const excluded = path.join(photosRoot, 'tmp');
    await makeImage(path.join(photosRoot, 'keep.jpg'));
    await makeImage(path.join(photosRoot, '.picasaoriginals', 'hidden.jpg'));
    await makeImage(path.join(photosRoot, 'node_modules', 'dep.jpg'));
    await makeImage(path.join(excluded, 'x', 'excluded.jpg'));

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [excluded] });

    expect(indexedPaths()).toEqual([path.join(photosRoot, 'keep.jpg')]);
  });

  it('does not duplicate photos when a folder is scanned again', async () => {
    await makeImage(path.join(photosRoot, 'a.jpg'));
    await makeImage(path.join(photosRoot, 'b.jpg'));

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
    await Scanner.stopAll();
    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(indexedPaths()).toHaveLength(2);
    expect(db.select().from(schema.folders).all()).toHaveLength(1);
  });

  it('logs a broken file and keeps indexing the others', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    fs.writeFileSync(path.join(photosRoot, 'broken.jpg'), 'not an image');
    for (let i = 0; i < 3; i++) await makeImage(path.join(photosRoot, `ok${i}.jpg`));

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(indexedPaths()).toHaveLength(3);
    expect(errors.mock.calls.some((call) => String(call[0]).includes('broken.jpg'))).toBe(true);
    errors.mockRestore();
  });

  it('indexes each photo once when one configured folder is inside another', async () => {
    const sub = path.join(photosRoot, 'sub');
    await makeImage(path.join(photosRoot, 'top.jpg'));
    for (let i = 0; i < 5; i++) await makeImage(path.join(sub, `s${i}.jpg`));

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot, sub], excludeDirs: [] });
    await dropImage(path.join(sub, 'live.jpg'));

    await vi.waitFor(() => expect(indexedPaths()).toContain(path.join(sub, 'live.jpg')), WAIT);
    const paths = indexedPaths();
    expect(paths).toHaveLength(7);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('removes a deleted photo together with its dependent data', async () => {
    const file = path.join(photosRoot, 'gone.jpg');
    await makeImage(file);
    await makeImage(path.join(photosRoot, 'stays.jpg'));
    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    const photo = db.select().from(schema.photos).where(eq(schema.photos.filename, 'gone.jpg')).get()!;
    const now = new Date().toISOString();
    db.insert(schema.edits).values({ photoId: photo.id, editInstructionsJson: '{}', updatedAt: now }).run();
    const album = db.insert(schema.albums).values({ name: 'A', createdAt: now }).returning().get();
    db.insert(schema.albumPhotos).values({ albumId: album.id, photoId: photo.id, addedAt: now }).run();
    db.insert(schema.faceAnnotations).values({ photoId: photo.id, boundingBox: '[0,0,1,1]' }).run();
    const tag = db.insert(schema.tags).values({ name: `t${photo.id}` }).returning().get();
    db.insert(schema.photoTags).values({ photoId: photo.id, tagId: tag.id }).run();

    fs.rmSync(file);

    await vi.waitFor(() => expect(indexedPaths()).toEqual([path.join(photosRoot, 'stays.jpg')]), WAIT);
    for (const table of [schema.edits, schema.albumPhotos, schema.faceAnnotations, schema.photoTags]) {
      expect(db.select().from(table).where(eq(table.photoId, photo.id)).all()).toEqual([]);
    }
  });

  describe('library follows the configured folders', () => {
    let a: string;
    let b: string;
    let snapshot: () => Record<string, number>;

    beforeEach(async () => {
      a = path.join(photosRoot, 'a');
      b = path.join(photosRoot, 'b');
      await makeImage(path.join(a, 'a1.jpg'));
      await makeImage(path.join(a, 'private', 'p1.jpg'));
      await makeImage(path.join(b, 'b1.jpg'));
      snapshot = () => Object.fromEntries(
        [path.join(a, 'a1.jpg'), path.join(a, 'private', 'p1.jpg'), path.join(b, 'b1.jpg')]
          .map((file) => [file, fs.statSync(file).mtimeMs]),
      );
      vi.spyOn(console, 'log').mockImplementation(() => {});
      await Scanner.startConfiguredFolders({ photosDirs: [a, b], excludeDirs: [] });
      await Scanner.stopAll();
      expect(indexedPaths()).toHaveLength(3);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('removes a folder that is no longer configured and leaves its files alone', async () => {
      const before = snapshot();

      await Scanner.startConfiguredFolders({ photosDirs: [a], excludeDirs: [] });

      expect(indexedPaths()).toEqual([path.join(a, 'a1.jpg'), path.join(a, 'private', 'p1.jpg')]);
      expect(db.select().from(schema.folders).where(eq(schema.folders.path, b)).get()).toBeUndefined();
      expect(snapshot()).toEqual(before);
    });

    it('removes a newly excluded subfolder', async () => {
      await Scanner.startConfiguredFolders({ photosDirs: [a, b], excludeDirs: [path.join(a, 'private')] });

      expect(indexedPaths()).toEqual([path.join(a, 'a1.jpg'), path.join(b, 'b1.jpg')]);
    });

    it('keeps photos of a configured folder that is missing on start', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const unmounted = `${b}_unmounted`;
      fs.renameSync(b, unmounted);

      try {
        await Scanner.startConfiguredFolders({ photosDirs: [a, b], excludeDirs: [] });
        expect(indexedPaths()).toContain(path.join(b, 'b1.jpg'));
        expect(errors.mock.calls.some((call) => String(call[0]).includes(b))).toBe(true);
      } finally {
        fs.renameSync(unmounted, b);
      }
    });

    it('indexes a folder again when it is added back', async () => {
      await Scanner.startConfiguredFolders({ photosDirs: [a], excludeDirs: [] });
      await Scanner.stopAll();

      await Scanner.startConfiguredFolders({ photosDirs: [a, b], excludeDirs: [] });

      expect(indexedPaths()).toContain(path.join(b, 'b1.jpg'));
    });
  });

  it('re-indexes a photo whose content changes, keeping star and edits', async () => {
    const file = path.join(photosRoot, 'rotate.jpg');
    await makeImage(file, 40, 30);
    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    const before = db.select().from(schema.photos).where(eq(schema.photos.filename, 'rotate.jpg')).get()!;
    db.update(schema.photos).set({ isStarred: true }).where(eq(schema.photos.id, before.id)).run();
    db.insert(schema.edits).values({ photoId: before.id, editInstructionsJson: '{"tuning":{"bw":true}}', updatedAt: '' }).run();

    // Rewrite the same file in place, as an editor saving a rotated image would
    const rotated = await sharp({ create: { width: 30, height: 40, channels: 3, background: '#00f' } }).jpeg().toBuffer();
    fs.writeFileSync(file, rotated);

    await vi.waitFor(() => {
      const after = db.select().from(schema.photos).where(eq(schema.photos.id, before.id)).get()!;
      expect(after.fileHash).not.toBe(before.fileHash);
      expect([after.width, after.height]).toEqual([30, 40]);
    }, WAIT);
    const after = db.select().from(schema.photos).where(eq(schema.photos.id, before.id)).get()!;
    expect(after.isStarred).toBe(true);
    expect(db.select().from(schema.edits).where(eq(schema.edits.photoId, before.id)).get()?.editInstructionsJson)
      .toBe('{"tuning":{"bw":true}}');
    expect(indexedPaths()).toEqual([file]);
    expect(fs.existsSync(path.join(tmpDir, 'cache', `${after.fileHash}_thumb.webp`))).toBe(true);
  });

  it('indexes a photo copied in slowly only after writing finishes', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
    const content = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#0a0' } }).jpeg().toBuffer();
    const file = path.join(photosRoot, 'slow.jpg');

    const fd = fs.openSync(file, 'w');
    fs.writeSync(fd, content, 0, content.length / 2);
    await new Promise((resolve) => setTimeout(resolve, 500));
    fs.writeSync(fd, content, content.length / 2);
    fs.closeSync(fd);

    await vi.waitFor(() => expect(indexedPaths()).toEqual([file]), WAIT);
    const photo = db.select().from(schema.photos).where(eq(schema.photos.filename, 'slow.jpg')).get()!;
    expect([photo.width, photo.height]).toEqual([64, 48]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('indexes photos and subfolders added while running', async () => {
    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    await dropImage(path.join(photosRoot, 'new.jpg'));
    await dropImage(path.join(photosRoot, 'new-folder', 'inside.jpg'));

    await vi.waitFor(() => expect(indexedPaths()).toEqual([
      path.join(photosRoot, 'new-folder', 'inside.jpg'),
      path.join(photosRoot, 'new.jpg'),
    ]), WAIT);
    const folder = db.select().from(schema.folders)
      .where(eq(schema.folders.path, path.join(photosRoot, 'new-folder'))).get();
    expect(folder?.name).toBe('new-folder');
  });
});
