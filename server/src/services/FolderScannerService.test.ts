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

/** A JPEG whose EXIF GPS is 48°9'39" N, 24°30'1" E (48.160833, 24.500278). */
async function makeGpsImage(filePath: string): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 30, channels: 3, background: '#468' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 9/1 39/1', GPSLongitudeRef: 'E', GPSLongitude: '24/1 30/1 1/1' } })
    .toFile(filePath);
}

const CAMERA = { lat: 48 + 9 / 60 + 39 / 3600, lon: 24 + 30 / 60 + 1 / 3600 };

/** Effective location of an indexed photo. */
function locationOf(filename: string) {
  const photo = db.select().from(schema.photos).where(eq(schema.photos.filename, filename)).get();
  if (!photo) throw new Error(`${filename} is not indexed`);
  return { latitude: photo.latitude, longitude: photo.longitude, source: photo.locationSource, cell: photo.geoCell };
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

  await (await import('../db/index.js')).openDatabase();
  ({ FolderScannerService: Scanner } = await import('./FolderScannerService.js'));
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
});

beforeEach(async () => {
  photosRoot = fs.mkdtempSync(path.join(tmpDir, 'photos_'));
  for (const table of [
    schema.edits, schema.faceDismissals, schema.detectedFaces, schema.faceDetections, schema.photoKeywords,
    schema.photoPeople, schema.photoFaces, schema.albumPhotos, schema.folderAlbums, schema.folderPeople, schema.persons,
    schema.photos, schema.folders,
  ]) {
    db.delete(table).run();
  }
});

afterEach(async () => {
  await Scanner.stopAll();
});

afterAll(async () => {
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

function writeSidecar(dir: string, photos: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  fs.writeFileSync(path.join(dir, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, ...extra, photos }));
}

function writeIni(dir: string, ...lines: string[]): void {
  fs.writeFileSync(path.join(dir, '.picasa.ini'), lines.map((line) => `${line}\r\n`).join(''));
}

/** The edit chain stored in the library for a photo, or null without edits. */
function editsOf(filename: string) {
  const row = db.select({ json: schema.edits.editInstructionsJson })
    .from(schema.edits)
    .innerJoin(schema.photos, eq(schema.edits.photoId, schema.photos.id))
    .where(eq(schema.photos.filename, filename))
    .get();
  return row ? JSON.parse(row.json) : null;
}

function fieldsOf(filename: string) {
  const photo = db.select().from(schema.photos).where(eq(schema.photos.filename, filename)).get();
  if (!photo) throw new Error(`${filename} is not indexed`);
  return {
    isStarred: photo.isStarred,
    isHidden: photo.isHidden,
    caption: photo.caption,
    keywords: photo.keywords ? JSON.parse(photo.keywords) : null,
  };
}

const NO_FIELDS = { isStarred: false, isHidden: false, caption: null, keywords: null };

/** Library album membership as sorted `folder/file` paths per token. */
function albumMembers(): Record<string, string[]> {
  const rows = db.select({ token: schema.albumPhotos.token, filename: schema.photos.filename, folder: schema.folders.path })
    .from(schema.albumPhotos)
    .innerJoin(schema.photos, eq(schema.albumPhotos.photoId, schema.photos.id))
    .innerJoin(schema.folders, eq(schema.photos.folderId, schema.folders.id))
    .all();
  const members: Record<string, string[]> = {};
  for (const row of rows) (members[row.token] ??= []).push(path.join(row.folder, row.filename));
  for (const list of Object.values(members)) list.sort();
  return members;
}

/** Library album definition names per folder path and token. */
function folderAlbumNames(): Record<string, Record<string, string | null>> {
  const rows = db.select({ token: schema.folderAlbums.token, name: schema.folderAlbums.name, folder: schema.folders.path })
    .from(schema.folderAlbums)
    .innerJoin(schema.folders, eq(schema.folderAlbums.folderId, schema.folders.id))
    .all();
  const names: Record<string, Record<string, string | null>> = {};
  for (const row of rows) (names[row.folder] ??= {})[row.token] = row.name;
  return names;
}

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
    db.insert(schema.albumPhotos).values({ photoId: photo.id, token: 'c9ea' }).run();
    db.insert(schema.faceDetections).values({ photoId: photo.id, detector: 'd', fileHash: photo.fileHash, detectedAt: now }).run();
    const faceId = db.insert(schema.detectedFaces)
      .values({ photoId: photo.id, rect: '{}', score: 1, descriptor: Buffer.alloc(512) })
      .returning({ id: schema.detectedFaces.id }).get().id;
    db.insert(schema.faceDismissals).values({ faceId, contactId: 'b8e4117cf1d6615b' }).run();
    db.insert(schema.photoKeywords).values({ photoId: photo.id, keyword: 'Old', key: 'old' }).run();
    db.insert(schema.photoPeople).values({ photoId: photo.id, contactId: 'b8e4117cf1d6615b', position: 0 }).run();
    db.insert(schema.photoFaces).values({ photoId: photo.id, contactId: 'b8e4117cf1d6615b', position: 0 }).run();

    fs.rmSync(file);

    await vi.waitFor(() => expect(indexedPaths()).toEqual([path.join(photosRoot, 'stays.jpg')]), WAIT);
    for (const table of [schema.edits, schema.albumPhotos, schema.faceDetections, schema.detectedFaces, schema.photoKeywords, schema.photoPeople, schema.photoFaces]) {
      expect(db.select().from(table).where(eq(table.photoId, photo.id)).all()).toEqual([]);
    }
    expect(db.select().from(schema.faceDismissals).all()).toEqual([]);
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

    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it('removes a folder that is no longer configured and leaves its files alone', async () => {
      const before = snapshot();

      await Scanner.startConfiguredFolders({ photosDirs: [a], excludeDirs: [] });

      expect(indexedPaths()).toEqual([path.join(a, 'a1.jpg'), path.join(a, 'private', 'p1.jpg')]);
      expect(db.select().from(schema.folders).where(eq(schema.folders.path, b)).get()).toBeUndefined();
      expect(snapshot()).toEqual(before);
    });

    it('drops the album definitions of a removed folder', async () => {
      const bFolder = db.select().from(schema.folders).where(eq(schema.folders.path, b)).get()!;
      db.insert(schema.folderAlbums).values({ folderId: bFolder.id, token: 'c9ea', name: 'Birds' }).run();

      await Scanner.startConfiguredFolders({ photosDirs: [a], excludeDirs: [] });

      expect(db.select().from(schema.folderAlbums).where(eq(schema.folderAlbums.folderId, bFolder.id)).all()).toEqual([]);
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
    writeSidecar(photosRoot, { 'rotate.jpg': { star: true, edits: [{ filter: 'bw' }] } });
    await vi.waitFor(() => expect(fieldsOf('rotate.jpg').isStarred).toBe(true), WAIT);

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
      .toBe('[{"filter":"bw"}]');
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

  describe('folder sidecar and Picasa .ini', () => {
    it('rebuilds the library fields from .paloma.json', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      await makeImage(path.join(photosRoot, 'b.jpg'));
      writeSidecar(photosRoot, {
        'a.jpg': { star: true, hidden: true, caption: 'Sunrise', keywords: ['dawn'], geo: { latitude: 1, longitude: 2 } },
      });

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(fieldsOf('a.jpg')).toEqual({ isStarred: true, isHidden: true, caption: 'Sunrise', keywords: ['dawn'] });
      expect(fieldsOf('b.jpg')).toEqual(NO_FIELDS);
      const a = db.select().from(schema.photos).where(eq(schema.photos.filename, 'a.jpg')).get()!;
      expect([a.latitude, a.longitude]).toEqual([null, null]);
    });

    it('shows a Picasa folder from its .ini without writing anything', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeIni(photosRoot, '[A.JPG]', 'star=yes', 'caption=From Picasa');

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(fieldsOf('a.jpg')).toMatchObject({ isStarred: true, caption: 'From Picasa' });
      expect(fs.readdirSync(photosRoot).sort()).toEqual(['.picasa.ini', 'a.jpg']);
      expect(indexedPaths()).toEqual([path.join(photosRoot, 'a.jpg')]);
    });

    it('ignores an MVP v1 sidecar and leaves it unchanged', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      await makeImage(path.join(photosRoot, 'a.jpg'));
      const v1 = JSON.stringify({ version: '1.0', folder_name: 'x', photos: { 'a.jpg': { is_starred: true } } });
      fs.writeFileSync(path.join(photosRoot, '.paloma.json'), v1);

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(fieldsOf('a.jpg')).toEqual(NO_FIELDS);
      expect(fs.readFileSync(path.join(photosRoot, '.paloma.json'), 'utf-8')).toBe(v1);
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('.paloma.json'));
      errors.mockRestore();
    });

    it('rebuilds edits from .paloma.json', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      await makeImage(path.join(photosRoot, 'b.jpg'));
      writeSidecar(photosRoot, { 'a.jpg': { edits: [{ filter: 'bw' }] }, 'b.jpg': { edits: 'sepia' } });

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(editsOf('a.jpg')).toEqual([{ filter: 'bw' }]);
      expect(editsOf('b.jpg')).toBeNull();
    });

    it('applies outside changes of edits in .paloma.json without a restart', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeSidecar(photosRoot, { 'a.jpg': { edits: [{ filter: 'bw' }] } });
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      writeSidecar(photosRoot, { 'a.jpg': { edits: [{ filter: 'sepia' }, { filter: 'rotate', angle: 90 }] } });
      await vi.waitFor(() => expect(editsOf('a.jpg')).toEqual([{ filter: 'sepia' }, { filter: 'rotate', angle: 90 }]), WAIT);

      writeSidecar(photosRoot, { 'a.jpg': { star: true } });
      await vi.waitFor(() => expect(editsOf('a.jpg')).toBeNull(), WAIT);
    });

    it('applies an outside edit of .paloma.json without a restart', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      writeSidecar(photosRoot, { 'a.jpg': { star: true, caption: 'Edited' } });

      await vi.waitFor(() => expect(fieldsOf('a.jpg')).toMatchObject({ isStarred: true, caption: 'Edited' }), WAIT);
      expect(indexedPaths()).toEqual([path.join(photosRoot, 'a.jpg')]);
    });

    it('clears the fields when .paloma.json is deleted and does not recreate it', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeSidecar(photosRoot, { 'a.jpg': { star: true } });
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      expect(fieldsOf('a.jpg').isStarred).toBe(true);

      fs.rmSync(path.join(photosRoot, '.paloma.json'));

      await vi.waitFor(() => expect(fieldsOf('a.jpg').isStarred).toBe(false), WAIT);
      expect(fs.existsSync(path.join(photosRoot, '.paloma.json'))).toBe(false);
    });

    it('clears the fields when .paloma.json becomes corrupt and leaves it unchanged', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeSidecar(photosRoot, { 'a.jpg': { star: true } });
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      fs.writeFileSync(path.join(photosRoot, '.paloma.json'), '{broken');

      await vi.waitFor(() => expect(fieldsOf('a.jpg').isStarred).toBe(false), WAIT);
      expect(fs.readFileSync(path.join(photosRoot, '.paloma.json'), 'utf-8')).toBe('{broken');
      errors.mockRestore();
    });

    it('follows a changed .ini in a folder without .paloma.json, writing nothing', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeIni(photosRoot, '[b.jpg]', 'star=yes');
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      expect(fieldsOf('a.jpg').isStarred).toBe(false);

      writeIni(photosRoot, '[a.jpg]', 'star=yes');

      await vi.waitFor(() => expect(fieldsOf('a.jpg').isStarred).toBe(true), WAIT);
      expect(fs.existsSync(path.join(photosRoot, '.paloma.json'))).toBe(false);
    });

    it('re-imports a changed .ini into an existing .paloma.json and the library', async () => {
      const { SidecarService } = await import('./SidecarService.js');
      const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await makeImage(path.join(photosRoot, 'a.jpg'));
      await makeImage(path.join(photosRoot, 'b.jpg'));
      writeIni(photosRoot, '[a.jpg]', 'caption=Old');
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      await SidecarService.updatePhotoFields(photosRoot, 'a.jpg', { star: true });

      writeIni(photosRoot, '[a.jpg]', 'caption=New', '[b.jpg]', 'star=yes');

      await vi.waitFor(() => expect(fieldsOf('b.jpg').isStarred).toBe(true), WAIT);
      const sidecar = JSON.parse(fs.readFileSync(path.join(photosRoot, '.paloma.json'), 'utf-8'));
      expect(sidecar.photos['b.jpg']).toEqual({ star: true });
      // a.jpg was changed in Paloma, so it keeps its imported caption
      expect(sidecar.photos['a.jpg']).toMatchObject({ star: true, caption: 'Old' });
      expect(fieldsOf('a.jpg')).toMatchObject({ isStarred: true, caption: 'Old' });
      expect(warnings).toHaveBeenCalledWith(expect.stringContaining('Conflict'));
      warnings.mockRestore();
    });

    it('ignores a Picasa .ini in .picasaoriginals and sidecars in excluded folders', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      fs.mkdirSync(path.join(photosRoot, '.picasaoriginals'));
      writeIni(path.join(photosRoot, '.picasaoriginals'), '[a.jpg]', 'star=yes');
      fs.mkdirSync(path.join(photosRoot, 'tmp'));
      writeSidecar(path.join(photosRoot, 'tmp'), { 'x.jpg': { star: true } });

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [path.join(photosRoot, 'tmp')] });
      writeSidecar(path.join(photosRoot, 'tmp'), { 'x.jpg': { star: true, caption: 'changed' } });
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(fieldsOf('a.jpg').isStarred).toBe(false);
      expect(db.select().from(schema.folders).all().map((f) => f.path)).toEqual([photosRoot]);
    });

    it('keeps the entry of a photo moved out and applies it when the photo comes back', async () => {
      const file = path.join(photosRoot, 'a.jpg');
      await makeImage(file);
      writeSidecar(photosRoot, { 'a.jpg': { star: true } });
      const sidecar = fs.readFileSync(path.join(photosRoot, '.paloma.json'), 'utf-8');
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      const outside = path.join(tmpDir, `moved_${Date.now()}.jpg`);
      fs.renameSync(file, outside);
      await vi.waitFor(() => expect(indexedPaths()).toEqual([]), WAIT);
      expect(fs.readFileSync(path.join(photosRoot, '.paloma.json'), 'utf-8')).toBe(sidecar);

      fs.renameSync(outside, file);
      await vi.waitFor(() => expect(indexedPaths()).toEqual([file]), WAIT);
      expect(fieldsOf('a.jpg').isStarred).toBe(true);
      expect(fs.readFileSync(path.join(photosRoot, '.paloma.json'), 'utf-8')).toBe(sidecar);
    });

    it('rebuilds albums spanning two folders from .paloma.json', async () => {
      const a = path.join(photosRoot, 'a');
      const b = path.join(photosRoot, 'b');
      await makeImage(path.join(a, '1.jpg'));
      await makeImage(path.join(a, '2.jpg'));
      await makeImage(path.join(b, '3.jpg'));
      writeSidecar(a, { '1.jpg': { albums: ['c9ea'] }, '2.jpg': { star: true } }, { albums: { c9ea: { name: 'Birds' } } });
      writeSidecar(b, { '3.jpg': { albums: ['c9ea', 'c9ea', 7] } }, { albums: { c9ea: { name: 'Birds', cover: '3.jpg' } } });

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(albumMembers()).toEqual({ c9ea: [path.join(a, '1.jpg'), path.join(b, '3.jpg')] });
      expect(folderAlbumNames()).toEqual({ [a]: { c9ea: 'Birds' }, [b]: { c9ea: 'Birds' } });
      expect(db.select({ cover: schema.folderAlbums.cover }).from(schema.folderAlbums).all().map((r) => r.cover).sort())
        .toEqual(['3.jpg', null]);
    });

    it('shows a Picasa album from the .ini without writing anything', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeIni(photosRoot, '[.album:c9ea]', 'name= Birds', 'token=c9ea', '[a.jpg]', 'albums=c9ea');

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(albumMembers()).toEqual({ c9ea: [path.join(photosRoot, 'a.jpg')] });
      expect(folderAlbumNames()).toEqual({ [photosRoot]: { c9ea: ' Birds' } });
      expect(fs.readdirSync(photosRoot).sort()).toEqual(['.picasa.ini', 'a.jpg']);
    });

    it('applies an album token added to .paloma.json by hand without a restart', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeSidecar(photosRoot, {}, { albums: { c9ea: { name: 'Birds' } } });
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      expect(albumMembers()).toEqual({});

      writeSidecar(photosRoot, { 'a.jpg': { albums: ['c9ea'] } }, { albums: { c9ea: { name: 'Birds' } } });

      await vi.waitFor(() => expect(albumMembers()).toEqual({ c9ea: [path.join(photosRoot, 'a.jpg')] }), WAIT);
    });

    it('applies folder files to photos already in the library on restart', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      await makeImage(path.join(photosRoot, 'b.jpg'));
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      await Scanner.stopAll();
      expect(fieldsOf('a.jpg')).toEqual(NO_FIELDS);

      // Changed while the server was down; the album tables start empty, as after the upgrade
      writeSidecar(photosRoot, { 'a.jpg': { star: true, albums: ['c9ea'] } }, { albums: { c9ea: { name: 'Birds' } } });
      for (const table of [schema.albumPhotos, schema.folderAlbums]) db.delete(table).run();
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(fieldsOf('a.jpg').isStarred).toBe(true);
      expect(albumMembers()).toEqual({ c9ea: [path.join(photosRoot, 'a.jpg')] });
      expect(folderAlbumNames()).toEqual({ [photosRoot]: { c9ea: 'Birds' } });
    });

    it('takes no albums from an unreadable sidecar', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeIni(photosRoot, '[.album:c9ea]', 'name=Birds', '[a.jpg]', 'albums=c9ea');
      fs.writeFileSync(path.join(photosRoot, '.paloma.json'), JSON.stringify({ format: 'paloma-folder', version: 2, albums: ['x'], photos: { 'a.jpg': { albums: ['c9ea'] } } }));

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(albumMembers()).toEqual({});
      expect(folderAlbumNames()).toEqual({});
      errors.mockRestore();
    });
  });

  describe('locations', () => {
    it('takes the camera location from EXIF', async () => {
      await makeGpsImage(path.join(photosRoot, 'a.jpg'));
      await makeImage(path.join(photosRoot, 'b.jpg'));

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      const a = locationOf('a.jpg');
      expect(a.latitude).toBeCloseTo(CAMERA.lat, 6);
      expect(a.longitude).toBeCloseTo(CAMERA.lon, 6);
      expect([a.source, a.cell]).toEqual(['exif', '4816:2450']);
      expect(locationOf('b.jpg')).toEqual({ latitude: null, longitude: null, source: null, cell: null });
    });

    it('lets a sidecar geotag override the camera, and null remove it', async () => {
      await makeGpsImage(path.join(photosRoot, 'a.jpg'));
      await makeGpsImage(path.join(photosRoot, 'b.jpg'));
      await makeGpsImage(path.join(photosRoot, 'c.jpg'));
      writeSidecar(photosRoot, {
        'a.jpg': { geotag: { lat: 50.45, lon: 30.5234 } },
        'b.jpg': { geotag: null },
        'c.jpg': { geotag: { lat: 95, lon: 10 } },
      });

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(locationOf('a.jpg')).toEqual({ latitude: 50.45, longitude: 30.5234, source: 'user', cell: '5045:3052' });
      expect(locationOf('b.jpg')).toEqual({ latitude: null, longitude: null, source: null, cell: null });
      expect(locationOf('c.jpg').source).toBe('exif');
    });

    it('shows a Picasa geotag live', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeIni(photosRoot, '[a.jpg]', 'geotag=33.770556,-84.293055');

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(locationOf('a.jpg')).toMatchObject({ latitude: 33.770556, longitude: -84.293055, source: 'user' });
      expect(fs.existsSync(path.join(photosRoot, '.paloma.json'))).toBe(false);
    });

    it('rebuilds locations from disk after the database is emptied', async () => {
      await makeImage(path.join(photosRoot, 'a.jpg'));
      writeSidecar(photosRoot, { 'a.jpg': { geotag: { lat: 50.45, lon: 30.5234 } } });
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      await Scanner.stopAll();
      for (const table of [schema.photos, schema.folders]) db.delete(table).run();

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      expect(locationOf('a.jpg')).toMatchObject({ latitude: 50.45, longitude: 30.5234, source: 'user' });
    });

    it('follows a geotag added to or removed from .paloma.json while running', async () => {
      await makeGpsImage(path.join(photosRoot, 'a.jpg'));
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      writeSidecar(photosRoot, { 'a.jpg': { geotag: { lat: 46.48, lon: 30.72 } } });
      await vi.waitFor(() => expect(locationOf('a.jpg')).toMatchObject({ latitude: 46.48, longitude: 30.72, source: 'user' }), WAIT);

      fs.rmSync(path.join(photosRoot, '.paloma.json'));
      await vi.waitFor(() => expect(locationOf('a.jpg').source).toBe('exif'), WAIT);
      expect(locationOf('a.jpg').latitude).toBeCloseTo(CAMERA.lat, 6);
    });

    it('keeps a sidecar location when the photo is rewritten without GPS', async () => {
      const file = path.join(photosRoot, 'a.jpg');
      await makeGpsImage(file);
      writeSidecar(photosRoot, { 'a.jpg': { geotag: { lat: 50.45, lon: 30.5234 } } });
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      const before = db.select().from(schema.photos).where(eq(schema.photos.filename, 'a.jpg')).get()!;

      fs.writeFileSync(file, await sharp({ create: { width: 30, height: 40, channels: 3, background: '#00f' } }).jpeg().toBuffer());

      await vi.waitFor(() => {
        const after = db.select().from(schema.photos).where(eq(schema.photos.id, before.id)).get()!;
        expect(after.fileHash).not.toBe(before.fileHash);
        expect(after.exifLatitude).toBeNull();
      }, WAIT);
      expect(locationOf('a.jpg')).toMatchObject({ latitude: 50.45, longitude: 30.5234, source: 'user' });
    });

    it('reads EXIF again for photos indexed by an older version, without new thumbnails', async () => {
      const file = path.join(photosRoot, 'a.jpg');
      await makeGpsImage(file);
      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
      await Scanner.stopAll();

      // As left by the MVP, whose GPS parsing never matched
      const { id, fileHash } = db.select().from(schema.photos).where(eq(schema.photos.filename, 'a.jpg')).get()!;
      db.update(schema.photos).set({
        latitude: null, longitude: null, exifLatitude: null, exifLongitude: null, locationSource: null, geoCell: null, metadataVersion: 0,
      }).where(eq(schema.photos.id, id)).run();
      const thumb = path.join(tmpDir, 'cache', `${fileHash}_thumb.webp`);
      const thumbTime = fs.statSync(thumb).mtimeMs;

      await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

      const row = db.select().from(schema.photos).where(eq(schema.photos.id, id)).get()!;
      expect(row.exifLatitude).toBeCloseTo(CAMERA.lat, 6);
      expect(row.latitude).toBeCloseTo(CAMERA.lat, 6);
      expect(row.metadataVersion).toBeGreaterThan(0);
      expect(fs.statSync(thumb).mtimeMs).toBe(thumbTime);
      expect(indexedPaths()).toEqual([file]);
    });
  });
});

describe('description, tags and people in the library', () => {
  const tagsOf = (filename: string) => db.select({ keyword: schema.photoKeywords.keyword, key: schema.photoKeywords.key })
    .from(schema.photoKeywords)
    .innerJoin(schema.photos, eq(schema.photoKeywords.photoId, schema.photos.id))
    .where(eq(schema.photos.filename, filename))
    .all();
  const peopleOf = (filename: string) => db.select({ contactId: schema.photoPeople.contactId })
    .from(schema.photoPeople)
    .innerJoin(schema.photos, eq(schema.photoPeople.photoId, schema.photos.id))
    .where(eq(schema.photos.filename, filename))
    .all().map((row) => row.contactId);
  const photoRow = (filename: string) => db.select().from(schema.photos).where(eq(schema.photos.filename, filename)).get()!;

  let text: typeof import('./embeddedText.fixtures.js');
  beforeAll(async () => { text = await import('./embeddedText.fixtures.js'); });

  it('shows the embedded IPTC caption and tags of a photo without an entry', async () => {
    await text.writeJpegWithText(path.join(photosRoot, 'a.jpg'), {
      iptc: text.iim([[2, 120, 'Market day'], [2, 25, 'Old'], [2, 25, 'old']]),
      exif: { Make: 'Canon', Model: 'Canon EOS 80D' },
    });

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(fieldsOf('a.jpg')).toMatchObject({ caption: 'Market day', keywords: ['Old'] });
    expect(tagsOf('a.jpg')).toEqual([{ keyword: 'Old', key: 'old' }]);
    const row = photoRow('a.jpg');
    expect(row.searchText).toBe(['a.jpg', photosRoot, 'Market day', 'Old', 'Canon', 'Canon EOS 80D'].join('\n').toLowerCase());
    expect(fs.readdirSync(photosRoot)).toEqual(['a.jpg']);
  });

  it('lets the sidecar caption win and "keywords": [] hide embedded tags after a rebuild', async () => {
    await text.writeJpegWithText(path.join(photosRoot, 'a.jpg'), { iptc: text.iim([[2, 120, 'Market day'], [2, 25, 'old']]) });
    writeSidecar(photosRoot, { 'a.jpg': { caption: 'Lviv market', keywords: [] } });

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(fieldsOf('a.jpg')).toMatchObject({ caption: 'Lviv market', keywords: null });
    expect(tagsOf('a.jpg')).toEqual([]);
    expect(photoRow('a.jpg')).toMatchObject({ embeddedCaption: 'Market day', embeddedKeywords: '["old"]' });
  });

  it('treats "caption": "" as a removed embedded description', async () => {
    await text.writeJpegWithText(path.join(photosRoot, 'a.jpg'), { iptc: text.iim([[2, 120, 'Market day']]) });
    writeSidecar(photosRoot, { 'a.jpg': { caption: '' } });

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(fieldsOf('a.jpg').caption).toBeNull();
    expect(photoRow('a.jpg').searchText).not.toContain('market');
  });

  it('updates the tag index when the sidecar is edited while running', async () => {
    await makeImage(path.join(photosRoot, 'a.jpg'));
    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
    expect(tagsOf('a.jpg')).toEqual([]);

    writeSidecar(photosRoot, { 'a.jpg': { keywords: ['Dawn', 'hills'] } });

    await vi.waitFor(() => expect(tagsOf('a.jpg').map((t) => t.key).sort()).toEqual(['dawn', 'hills']), WAIT);
  });

  it('shows the people of a Picasa-only folder live', async () => {
    await makeImage(path.join(photosRoot, 'a.jpg'));
    writeIni(photosRoot, '[Contacts2]', 'b8e4117cf1d6615b=Roy Avery;;', '[a.jpg]',
      'faces=rect64(579922efa1cce2aa),b8e4117cf1d6615b;rect64(1),b8e4117cf1d6615b;rect64(2),ffffffffffffffff');

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(peopleOf('a.jpg')).toEqual(['b8e4117cf1d6615b']);
    expect(db.select().from(schema.folderPeople).all())
      .toEqual([expect.objectContaining({ contactId: 'b8e4117cf1d6615b', name: 'Roy Avery', email: null })]);
    expect(fs.readdirSync(photosRoot).sort()).toEqual(['.picasa.ini', 'a.jpg']);
  });

  it('adds the contacts named by faces as persons without writing files', async () => {
    await makeImage(path.join(photosRoot, 'a.jpg'));
    writeIni(photosRoot, '[Contacts2]', 'b8e4117cf1d6615b=Roy Avery;;', '0123456789abcdef=No Faces;;', '[a.jpg]',
      'faces=rect64(579922efa1cce2aa),b8e4117cf1d6615b;rect64(2),ffffffffffffffff');

    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });

    expect(db.select({ id: schema.persons.contactId, edited: schema.persons.edited }).from(schema.persons).all())
      .toEqual([{ id: 'b8e4117cf1d6615b', edited: false }]);
    expect(db.select({ contactId: schema.photoFaces.contactId, rect: schema.photoFaces.rect }).from(schema.photoFaces).all())
      .toEqual([{ contactId: 'b8e4117cf1d6615b', rect: expect.stringContaining('"left"') }]);
    expect(fs.readdirSync(photosRoot).sort()).toEqual(['.picasa.ini', 'a.jpg']);
  });

  it('adds a person for a mark without a rectangle and keeps persons when their photos go', async () => {
    const file = path.join(photosRoot, 'a.jpg');
    await makeImage(file);
    writeSidecar(photosRoot, { 'a.jpg': { faces: [{ person: '0123456789abcdef' }] } });
    await Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] });
    expect(peopleOf('a.jpg')).toEqual(['0123456789abcdef']);

    fs.rmSync(file);

    await vi.waitFor(() => expect(indexedPaths()).toEqual([]), WAIT);
    expect(db.select({ id: schema.persons.contactId }).from(schema.persons).all()).toEqual([{ id: '0123456789abcdef' }]);
  });
});

describe('large folders', () => {
  const COUNT = 1200;

  /** A library folder with COUNT photos indexed (no files needed to apply folder files) and a sidecar starring them all. */
  function largeFolder(): string {
    const folderId = db.insert(schema.folders).values({ path: photosRoot, name: 'large', indexedAt: '' })
      .returning({ id: schema.folders.id }).get().id;
    const names = Array.from({ length: COUNT }, (_, i) => `IMG_${String(i).padStart(4, '0')}.jpg`);
    for (let i = 0; i < names.length; i += 200) {
      db.insert(schema.photos).values(names.slice(i, i + 200).map((filename) => ({ folderId, filename, fileHash: filename, createdAt: '' }))).run();
    }
    writeSidecar(photosRoot, Object.fromEntries(names.map((name) => [name, { star: true, keywords: ['batch'] }])));
    return photosRoot;
  }

  const starred = () => db.select({ id: schema.photos.id }).from(schema.photos).where(eq(schema.photos.isStarred, true)).all().length;

  it('applies the folder files to every photo, batch after batch', async () => {
    const dir = largeFolder();
    const { SidecarService } = await import('./SidecarService.js');
    await Scanner.applyFolderState(dir, await SidecarService.getFolderState(dir));
    expect(starred()).toBe(COUNT);
    expect(db.select({ id: schema.photoKeywords.photoId }).from(schema.photoKeywords).all()).toHaveLength(COUNT);
  });

  it('answers other queries between batches instead of after the whole folder', async () => {
    const dir = largeFolder();
    const { SidecarService } = await import('./SidecarService.js');
    const { all } = await import('../db/query.js');
    const state = await SidecarService.getFolderState(dir);

    let applied = false;
    let seenDuringApply = -1;
    const reader = new Promise<void>((resolve) => setImmediate(() => {
      all(db.select({ id: schema.photos.id }).from(schema.photos).where(eq(schema.photos.isStarred, true))).then((rows) => {
        seenDuringApply = applied ? -1 : rows.length;
        resolve();
      });
    }));
    const apply = Scanner.applyFolderState(dir, state).then(() => { applied = true; });
    await Promise.all([reader, apply]);

    expect(seenDuringApply).toBeGreaterThan(0);
    expect(seenDuringApply).toBeLessThan(COUNT);
    expect(starred()).toBe(COUNT);
  });
});

describe('the library during a scan', () => {
  it('lists the photos indexed so far before the initial scan has finished', async () => {
    const COUNT = 40;
    for (let i = 0; i < COUNT; i++) await makeImage(path.join(photosRoot, `scan_${i}.jpg`), 400, 300);
    const { listPhotos } = await import('./photoApi.js');
    const indexed = () => db.select({ id: schema.photos.id }).from(schema.photos).all().length;

    let scanned = false;
    const scan = Scanner.startConfiguredFolders({ photosDirs: [photosRoot], excludeDirs: [] }).then(() => { scanned = true; });
    await vi.waitFor(() => expect(indexed()).toBeGreaterThan(0), WAIT);

    const listed = await listPhotos({});
    const answeredDuringScan = !scanned;
    await scan;

    expect(answeredDuringScan).toBe(true);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.length).toBeLessThan(COUNT);
    expect(indexed()).toBe(COUNT);
  }, 30_000);
});
