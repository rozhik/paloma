import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SidecarService, SidecarUnreadableError, withMark, withoutPerson } from './SidecarService.js';
import type { PalomaFolderFile, PalomaPhotoEntry } from '../../../shared/types.js';

let dir: string;

const sidecarPath = (): string => path.join(dir, '.paloma.json');
const writeJson = (value: unknown): void => fs.writeFileSync(sidecarPath(), JSON.stringify(value));
const readJson = (): PalomaFolderFile => JSON.parse(fs.readFileSync(sidecarPath(), 'utf-8'));
const writeIni = (...lines: string[]): Buffer => {
  const bytes = Buffer.from(lines.map((line) => `${line}\r\n`).join(''));
  fs.writeFileSync(path.join(dir, '.picasa.ini'), bytes);
  return bytes;
};
const sha256 = (bytes: Buffer): string => crypto.createHash('sha256').update(bytes).digest('hex');
const touch = (...names: string[]): void => names.forEach((name) => fs.writeFileSync(path.join(dir, name), ''));

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_sidecar_test_'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  fs.chmodSync(dir, 0o755);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('readFolderSidecar', () => {
  it('reports a missing file', async () => {
    expect(await SidecarService.readFolderSidecar(dir)).toEqual({ kind: 'missing' });
  });

  it('reads a valid v2 file and treats absent photos as empty', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { star: true } } });
    expect(await SidecarService.readFolderSidecar(dir)).toMatchObject({ kind: 'ok', data: { photos: { 'a.jpg': { star: true } } } });

    writeJson({ format: 'paloma-folder', version: 2 });
    expect(await SidecarService.readFolderSidecar(dir)).toMatchObject({ kind: 'ok', data: { photos: {} } });
  });

  it.each([
    ['invalid JSON', '{"format": "paloma-folder",'],
    ['MVP v1 shape', JSON.stringify({ version: '1.0', folder_name: 'x', photos: { 'a.jpg': { is_starred: true } } })],
    ['another format', JSON.stringify({ format: 'other', version: 2, photos: {} })],
    ['a newer version', JSON.stringify({ format: 'paloma-folder', version: 3, photos: {} })],
    ['a non-object entry', JSON.stringify({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': true } })],
    ['an array', '[]'],
    ['a non-string iniHash', JSON.stringify({ format: 'paloma-folder', version: 2, iniHash: 1, photos: {} })],
    ['albums that is an array', JSON.stringify({ format: 'paloma-folder', version: 2, albums: ['Birds'], photos: {} })],
    ['a non-object album definition', JSON.stringify({ format: 'paloma-folder', version: 2, albums: { c9ea: 'Birds' }, photos: {} })],
  ])('reports %s as unreadable', async (_, content) => {
    fs.writeFileSync(sidecarPath(), content);
    expect((await SidecarService.readFolderSidecar(dir)).kind).toBe('unreadable');
  });
});

describe('fieldsOf', () => {
  it('reads fields of the wrong type as absent', async () => {
    expect(SidecarService.fieldsOf({ star: 'yes', hidden: 1, caption: 5, keywords: 'a,b' } as unknown as PalomaPhotoEntry)).toEqual({});
    // "" and [] mark embedded text as removed, so they are kept
    expect(SidecarService.fieldsOf({ caption: '', keywords: ['a', 3, '', 'b'] } as unknown as PalomaPhotoEntry)).toEqual({ caption: '', keywords: ['a', 'b'] });
    expect(SidecarService.fieldsOf({ star: true, hidden: true, caption: 'x', modified: 't', rotate: 90 }))
      .toEqual({ star: true, hidden: true, caption: 'x' });
  });

  it('reads albums as a list of tokens without empty items or duplicates', async () => {
    expect(SidecarService.fieldsOf({ albums: ['c9ea', '', 'c9ea', 3, '7f01'] } as unknown as PalomaPhotoEntry))
      .toEqual({ albums: ['c9ea', '7f01'] });
    expect(SidecarService.fieldsOf({ albums: 'c9ea' } as unknown as PalomaPhotoEntry)).toEqual({});
  });
});

describe('reimport', () => {
  const base = (photos: PalomaFolderFile['photos']): PalomaFolderFile =>
    ({ format: 'paloma-folder', version: 2, iniHash: 'old', photos });

  it('makes unmodified entries follow the .ini and keeps their other keys', async () => {
    const result = SidecarService.reimport(
      base({
        'a.jpg': { caption: 'Old', star: true, rotate: 90 },
        'b.jpg': { caption: 'Gone' },
      }),
      { 'a.jpg': { star: true } },
      'new',
    );
    expect(result.photos).toEqual({ 'a.jpg': { star: true, rotate: 90 } });
    expect(result.iniHash).toBe('new');
  });

  it('adds entries for new sections', async () => {
    const result = SidecarService.reimport(base({}), { 'd.jpg': { star: true } }, 'new');
    expect(result.photos).toEqual({ 'd.jpg': { star: true } });
  });

  it('keeps entries changed in Paloma and logs a conflict', async () => {
    const entry = { caption: 'Mine', modified: '2026-10-04T10:00:00.000Z' };
    const result = SidecarService.reimport(base({ 'a.jpg': entry }), { 'a.jpg': { caption: 'Theirs' } }, 'new');
    expect(result.photos['a.jpg']).toEqual(entry);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Conflict'));
  });

  it('does not log a conflict when a changed entry agrees with the .ini', async () => {
    SidecarService.reimport(base({ 'a.jpg': { star: true, modified: 't' } }), { 'a.jpg': { star: true } }, 'new');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('makes memberships of unmodified entries follow the .ini', async () => {
    const result = SidecarService.reimport(
      base({ 'a.jpg': { albums: ['old'] }, 'b.jpg': { albums: ['mine'], modified: 't' } }),
      { 'a.jpg': { albums: ['new'] }, 'b.jpg': { albums: ['new'] } },
      'new',
    );
    expect(result.photos).toEqual({ 'a.jpg': { albums: ['new'] }, 'b.jpg': { albums: ['mine'], modified: 't' } });
  });

  it('re-imports album definitions without removing any', async () => {
    const result = SidecarService.reimport(
      {
        ...base({}),
        albums: {
          renamed: { name: 'Old', date: 'd', extra: { name_lh: 'x' } },
          mine: { name: 'Mine', modified: 't' },
          gone: { name: 'Gone' },
        },
      },
      {},
      'new',
      '',
      { renamed: { name: 'New' }, mine: { name: 'Theirs' }, added: { name: 'Added' } },
    );
    expect(result.albums).toEqual({
      renamed: { name: 'New', extra: { name_lh: 'x' } },
      mine: { name: 'Mine', modified: 't' },
      gone: { name: 'Gone' },
      added: { name: 'Added' },
    });
  });

  it('keeps unknown top-level sections', async () => {
    const result = SidecarService.reimport({ ...base({}), albums: { x: {} } }, {}, 'new');
    expect(result.albums).toEqual({ x: {} });
  });
});

describe('getFolderState', () => {
  it('reads the fields from .paloma.json', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { star: true, caption: 'Sunrise' }, 'b.jpg': { rotate: 90 } } });
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'a.jpg': { star: true, caption: 'Sunrise' } });
  });

  it('shows a Picasa folder live without writing anything', async () => {
    touch('img_0042.jpg');
    writeIni('[IMG_0042.JPG]', 'star=yes', '[gone.jpg]', 'caption=x');
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'img_0042.jpg': { star: true }, 'gone.jpg': { caption: 'x' } });
    expect(fs.existsSync(sidecarPath())).toBe(false);
  });

  it('returns album definitions from .paloma.json', async () => {
    writeJson({ format: 'paloma-folder', version: 2, albums: { c9ea: { name: 'Birds', cover: 'a.jpg' } }, photos: { 'a.jpg': { albums: ['c9ea'] } } });
    expect(await SidecarService.getFolderState(dir)).toEqual({
      photos: { 'a.jpg': { albums: ['c9ea'] } },
      albums: { c9ea: { name: 'Birds', cover: 'a.jpg' } },
      people: {},
    });
  });

  it('shows Picasa albums live without writing anything', async () => {
    touch('a.jpg');
    writeIni('[.album:c9ea]', 'name= Birds', 'token=c9ea', '[a.jpg]', 'albums=c9ea');
    expect(await SidecarService.getFolderState(dir)).toEqual({
      photos: { 'a.jpg': { albums: ['c9ea'] } },
      albums: { c9ea: { name: ' Birds' } },
      people: {},
    });
    expect(fs.existsSync(sidecarPath())).toBe(false);
  });

  it('re-imports a changed .ini into the sidecar', async () => {
    writeIni('[a.jpg]', 'star=yes', '[d.jpg]', 'star=yes');
    writeJson({ format: 'paloma-folder', version: 2, iniHash: 'stale', photos: { 'a.jpg': { star: true } } });

    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'a.jpg': { star: true }, 'd.jpg': { star: true } });
    const written = readJson();
    expect(written.photos['d.jpg']).toEqual({ star: true });
    expect(written.iniHash).toBe(sha256(fs.readFileSync(path.join(dir, '.picasa.ini'))));
  });

  it('leaves the sidecar alone when the .ini is unchanged or deleted', async () => {
    const bytes = writeIni('[a.jpg]', 'star=yes');
    writeJson({ format: 'paloma-folder', version: 2, iniHash: sha256(bytes), photos: { 'a.jpg': { caption: 'x' } } });
    const before = fs.readFileSync(sidecarPath(), 'utf-8');

    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'a.jpg': { caption: 'x' } });
    fs.rmSync(path.join(dir, '.picasa.ini'));
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'a.jpg': { caption: 'x' } });
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe(before);
  });

  it('ignores the .ini when there is a sidecar without iniHash', async () => {
    writeIni('[a.jpg]', 'star=yes');
    writeJson({ format: 'paloma-folder', version: 2, photos: {} });
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({});
  });

  it('gives no fields for an unreadable sidecar, ignores the .ini and keeps the file', async () => {
    writeIni('[a.jpg]', 'star=yes');
    fs.writeFileSync(sidecarPath(), '{broken');
    expect(await SidecarService.getFolderState(dir)).toEqual({ photos: {}, albums: {}, people: {} });
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe('{broken');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('.paloma.json'));
  });
});

describe('updatePhotoFields', () => {
  it('creates a new sidecar with the exact expected content', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-04T14:20:00.000Z'), toFake: ['Date'] });
    try {
      await SidecarService.updatePhotoFields(dir, 'IMG_0042.jpg', { star: true });
    } finally {
      vi.useRealTimers();
    }
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe([
      '{',
      '  "format": "paloma-folder",',
      '  "version": 2,',
      '  "photos": {',
      '    "IMG_0042.jpg": {',
      '      "star": true,',
      '      "modified": "2026-10-04T14:20:00.000Z"',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n'));
  });

  it('stores all fields and clears them with false, empty string and empty list', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true, hidden: true, caption: 'Sunrise', keywords: ['mountains', 'dawn'] });
    expect(readJson().photos['a.jpg']).toMatchObject({ star: true, hidden: true, caption: 'Sunrise', keywords: ['mountains', 'dawn'] });

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { hidden: false, caption: '' });
    expect(SidecarService.fieldsOf(readJson().photos['a.jpg'])).toEqual({ star: true, keywords: ['mountains', 'dawn'] });
  });

  it('removes an emptied entry when there is no iniHash', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: false });
    expect(readJson().photos).toEqual({});
  });

  it('imports the Picasa .ini on the first change, including sections for missing files', async () => {
    touch('a.jpg', 'b.jpg', 'c.jpg');
    const bytes = writeIni('[a.jpg]', 'caption=Sunrise', '[b.jpg]', 'star=yes', '[gone.jpg]', 'star=yes', '[x.jpg]', 'filters=enhance=1;');
    const iniBefore = fs.readFileSync(path.join(dir, '.picasa.ini'));

    await SidecarService.updatePhotoFields(dir, 'c.jpg', { star: true });

    const written = readJson();
    expect(Object.keys(written)).toEqual(['format', 'version', 'iniHash', 'photos']);
    expect(written.iniHash).toBe(sha256(bytes));
    expect(written.photos).toEqual({
      'a.jpg': { caption: 'Sunrise' },
      'b.jpg': { star: true },
      'c.jpg': { star: true, modified: expect.any(String) },
      'gone.jpg': { star: true },
      'x.jpg': { edits: [{ filter: 'enhance' }] },
    });
    expect(fs.readFileSync(path.join(dir, '.picasa.ini')).equals(iniBefore)).toBe(true);
  });

  it('imports Picasa album definitions and memberships on the first change', async () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[.album:c9ea]', 'name=Birds', 'token=c9ea', '[.album:7f01]', 'token=7f01', '[a.jpg]', 'albums=c9ea');

    await SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });

    const written = readJson();
    expect(Object.keys(written)).toEqual(['format', 'version', 'iniHash', 'albums', 'photos']);
    expect(written.albums).toEqual({ c9ea: { name: 'Birds' }, '7f01': {} });
    expect(written.photos['a.jpg']).toEqual({ albums: ['c9ea'] });
    expect(written.photos['b.jpg']).toEqual({ star: true, modified: expect.any(String) });
  });

  it('keeps an unstarred imported entry with modified so a re-import does not bring the star back', async () => {
    touch('a.jpg');
    writeIni('[a.jpg]', 'star=yes');
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: false });
    expect(readJson().photos['a.jpg']).toEqual({ modified: expect.any(String) });

    writeIni('[a.jpg]', 'star=yes', '[b.jpg]', 'star=yes');
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'b.jpg': { star: true } });
    expect(fs.readFileSync(path.join(dir, '.picasa.ini'), 'utf-8')).toContain('[b.jpg]');
  });

  it('re-imports a changed .ini before applying the change', async () => {
    writeIni('[a.jpg]', 'star=yes');
    await SidecarService.updatePhotoFields(dir, 'b.jpg', { caption: 'x' });
    writeIni('[a.jpg]', 'star=yes', '[d.jpg]', 'hidden=yes');

    await SidecarService.updatePhotoFields(dir, 'b.jpg', { caption: 'y' });

    const written = readJson();
    expect(written.photos['d.jpg']).toEqual({ hidden: true });
    expect(written.photos['b.jpg'].caption).toBe('y');
  });

  it('preserves unknown top-level sections and entry keys', async () => {
    writeJson({
      format: 'paloma-folder',
      version: 2,
      albums: { c9ea: { name: ' Birds' } },
      photos: { 'a.jpg': { rotate: 90, edits: [{ filter: 'autolight' }] }, 'z.jpg': { star: true } },
      extra: { encoding: { utf8: '1' } },
    });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });

    const written = readJson();
    expect(Object.keys(written)).toEqual(['format', 'version', 'albums', 'photos', 'extra']);
    expect(written.albums).toEqual({ c9ea: { name: ' Birds' } });
    expect(written.extra).toEqual({ encoding: { utf8: '1' } });
    expect(written.photos['a.jpg']).toMatchObject({ rotate: 90, edits: [{ filter: 'autolight' }], star: true });
    expect(written.photos['z.jpg']).toEqual({ star: true });
  });

  it('keeps photo keys in a stable order', async () => {
    await SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    expect(Object.keys(readJson().photos)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('refuses to touch an unreadable sidecar', async () => {
    fs.writeFileSync(sidecarPath(), JSON.stringify({ version: '1.0', photos: {} }));
    const before = fs.readFileSync(sidecarPath(), 'utf-8');

    await expect(SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true })).rejects.toThrow(SidecarUnreadableError);
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe(before);
  });

  it('refuses to touch a sidecar with a malformed albums section', async () => {
    writeJson({ format: 'paloma-folder', version: 2, albums: ['Birds'], photos: { 'a.jpg': { star: true } } });
    const before = fs.readFileSync(sidecarPath(), 'utf-8');

    expect(await SidecarService.getFolderState(dir)).toEqual({ photos: {}, albums: {}, people: {} });
    await expect(SidecarService.updatePhotoFields(dir, 'a.jpg', { caption: 'x' })).rejects.toThrow(SidecarUnreadableError);
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe(before);
  });

  it.skipIf(process.getuid?.() === 0)('throws in a read-only folder and leaves no temp file', async () => {
    fs.chmodSync(dir, 0o555);
    await expect(SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true })).rejects.toThrow();
    fs.chmodSync(dir, 0o755);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('removes the temp file when the rename fails', async () => {
    fs.mkdirSync(sidecarPath()); // a directory in the way makes rename fail after the temp file was written
    fs.writeFileSync(path.join(sidecarPath(), 'keep'), '');
    vi.spyOn(SidecarService, 'readFolderSidecar').mockResolvedValue({ kind: 'missing' });

    await expect(SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true })).rejects.toThrow();
    expect(fs.readdirSync(dir)).toEqual(['.paloma.json']);
  });
});

describe('geotag', () => {
  it('reads a valid geotag and null, and treats any other value as absent', async () => {
    expect(SidecarService.fieldsOf({ geotag: { lat: 50.45, lon: 30.5234 } })).toEqual({ geotag: { lat: 50.45, lon: 30.5234 } });
    expect(SidecarService.fieldsOf({ geotag: null })).toEqual({ geotag: null });
    for (const geotag of [{ lat: 95, lon: 10 }, { lat: '50', lon: 30 }, { lat: 50 }, [50, 30], '50,30', { lat: 0, lon: 200 }]) {
      expect(SidecarService.fieldsOf({ geotag } as unknown as PalomaPhotoEntry), JSON.stringify(geotag)).toEqual({});
    }
  });

  it('writes a rounded geotag, null, and deletes the key', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: { lat: 48.1608334999, lon: 24.50027777 } });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: { lat: 48.160833, lon: 24.500278 }, modified: expect.any(String) });

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: null });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: null, modified: expect.any(String) });

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: false });
    expect(readJson().photos).toEqual({});
  });

  it('keeps an invalid geotag in the file until the location is changed', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { geotag: { lat: 95, lon: 10 } } } });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    expect(readJson().photos['a.jpg'].geotag).toEqual({ lat: 95, lon: 10 });
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ star: true });
  });

  it('saves several photos of a folder in one write with the same modified time', async () => {
    await SidecarService.updatePhotosFields(dir, { 'a.jpg': { geotag: { lat: 1, lon: 2 } }, 'b.jpg': { geotag: { lat: 1, lon: 2 }, caption: 'x' } });
    const { photos } = readJson();
    expect(photos['a.jpg']).toEqual({ geotag: { lat: 1, lon: 2 }, modified: expect.any(String) });
    expect(photos['b.jpg']).toEqual({ geotag: { lat: 1, lon: 2 }, caption: 'x', modified: photos['a.jpg'].modified });
  });

  it('imports a Picasa geotag on the first change and shows it live before', async () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[a.jpg]', 'geotag=33.770556,-84.293055');
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'a.jpg': { geotag: { lat: 33.770556, lon: -84.293055 } } });
    expect(fs.existsSync(sidecarPath())).toBe(false);

    await SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: { lat: 33.770556, lon: -84.293055 } });
  });

  it('re-imports a changed Picasa geotag into an unmodified entry', async () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[a.jpg]', 'geotag=10,20');
    await SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });

    writeIni('[a.jpg]', 'geotag=11,21');
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ geotag: { lat: 11, lon: 21 } });

    writeIni('[a.jpg]', 'star=yes');
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ star: true });
  });

  it('keeps a location set in Paloma when Picasa changes it, and logs a conflict', async () => {
    touch('a.jpg');
    writeIni('[a.jpg]', 'geotag=10,20');
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: { lat: 1, lon: 2 } });

    writeIni('[a.jpg]', 'geotag=11,21');
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ geotag: { lat: 1, lon: 2 } });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Conflict'));
  });

  it('keeps an entry with only a removed location even without iniHash', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: null });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: null, modified: expect.any(String) });
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'a.jpg': { geotag: null } });
  });
});

describe('edits', () => {
  const CHAIN = [{ filter: 'rotate', angle: 90 }, { filter: 'sepia' }];

  it('stores the chain with modified and removes it with an empty list', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: CHAIN });
    expect(readJson().photos['a.jpg']).toEqual({ edits: CHAIN, modified: expect.any(String) });
    expect(SidecarService.fieldsOf(readJson().photos['a.jpg'])).toEqual({ edits: CHAIN });

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [] });
    expect(readJson().photos['a.jpg']).toEqual({ star: true, modified: expect.any(String) });
  });

  it('keeps steps of unknown filters and their unknown keys exactly', async () => {
    const chain = [{ filter: 'grain', amount: 30, nested: { x: [1] }, enabled: false as const }];
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: chain });
    expect(readJson().photos['a.jpg'].edits).toEqual(chain);
  });

  it('reads edits of the wrong type as absent and keeps them in the file until edits are saved', async () => {
    writeJson({
      format: 'paloma-folder',
      version: 2,
      photos: { 'a.jpg': { edits: 'sepia' }, 'b.jpg': { edits: [{ filter: 'bw' }, { name: 'x' }] } },
    });
    expect(SidecarService.fieldsOf(readJson().photos['a.jpg'])).toEqual({});
    expect(SidecarService.fieldsOf(readJson().photos['b.jpg'])).toEqual({});

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    expect(readJson().photos['a.jpg'].edits).toBe('sepia');
    expect(readJson().photos['b.jpg'].edits).toEqual([{ filter: 'bw' }, { name: 'x' }]);

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [{ filter: 'bw' }] });
    expect(readJson().photos['a.jpg'].edits).toEqual([{ filter: 'bw' }]);
  });

  it('follows the Picasa filters in a re-import of an unmodified entry', async () => {
    const result = SidecarService.reimport(
      {
        format: 'paloma-folder',
        version: 2,
        iniHash: 'old',
        photos: { 'a.jpg': { star: true, edits: [{ filter: 'bw' }] }, 'b.jpg': { edits: [{ filter: 'bw' }] } },
      },
      { 'a.jpg': { caption: 'From Picasa' }, 'b.jpg': { edits: [{ filter: 'bw' }, { filter: 'sepia' }] } },
      'new',
    );
    expect(result.photos['a.jpg']).toEqual({ caption: 'From Picasa' });
    expect(result.photos['b.jpg']).toEqual({ edits: [{ filter: 'bw' }, { filter: 'sepia' }] });
  });

  it('keeps edits made in Paloma when Picasa changes its filters, and logs a conflict', async () => {
    const entry = { edits: [{ filter: 'sepia' }], modified: '2026-10-05T10:00:00.000Z' };
    const result = SidecarService.reimport(
      { format: 'paloma-folder', version: 2, iniHash: 'old', photos: { 'a.jpg': entry } },
      { 'a.jpg': { edits: [{ filter: 'bw' }] } },
      'new',
    );
    expect(result.photos['a.jpg']).toEqual(entry);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Conflict'));
  });

  it('is shown live from the Picasa .ini and becomes undoable after the first change', async () => {
    touch('a.jpg');
    writeIni('[a.jpg]', 'filters=crop64=1,33101d68ffffffff;sepia=1;');
    const crop = { filter: 'crop64', rect: { left: 0.199466, top: 0.11487, right: 1, bottom: 1 } };
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ edits: [crop, { filter: 'sepia' }] });

    // Undo in the viewer saves the chain without its last step
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [crop] });
    expect(readJson().photos['a.jpg']).toEqual({ edits: [crop], modified: expect.any(String) });
  });

  it('is part of the folder state', async () => {
    touch('a.jpg');
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [{ filter: 'bw' }] });
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ edits: [{ filter: 'bw' }] });
  });
});

const FACE = { rect: { left: 0.34, top: 0.13, right: 0.63, bottom: 0.88 }, person: 'b8e4117cf1d6615b' };
const ROY = { name: 'Roy Avery', email: null, googleId: null };

describe('faces and people', () => {
  it('reads "" and [] as removed embedded text', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { caption: '', keywords: [] } } });
    expect((await SidecarService.getFolderState(dir)).photos).toEqual({ 'a.jpg': { caption: '', keywords: [] } });
  });

  it.each([
    [[{ person: 5 }]],
    [[{ ignored: true }]],
    [[{ person: 'b8e4117cf1d6615b', rect: { left: 2, top: 0, right: 1, bottom: 1 } }]],
  ])('ignores a malformed face %j for the library and keeps it in the file', async (faces) => {
    touch('a.jpg', 'b.jpg');
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { faces } } });

    expect((await SidecarService.getFolderState(dir)).photos).toEqual({});
    await SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });
    expect(readJson().photos['a.jpg']).toEqual({ faces });
  });

  it('reads a mark without a rectangle', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { faces: [{ person: 'b8e4117cf1d6615b' }] } } });
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ faces: [{ person: 'b8e4117cf1d6615b' }] });
  });

  it('keeps faces when the photo is starred', async () => {
    touch('a.jpg');
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { faces: [FACE] } } });

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });

    expect(readJson().photos['a.jpg']).toMatchObject({ faces: [FACE], star: true });
    expect((await SidecarService.getFolderState(dir)).photos['a.jpg']).toEqual({ star: true, faces: [FACE] });
  });

  it('reads valid people and ignores an invalid people section without rejecting the file', async () => {
    writeJson({
      format: 'paloma-folder', version: 2,
      people: { b8e4117cf1d6615b: ROY, nothex: ROY, '0123456789abcdef': { name: 5 } },
      photos: { 'a.jpg': { star: true } },
    });
    expect(await SidecarService.getFolderState(dir)).toMatchObject({ people: { b8e4117cf1d6615b: ROY }, photos: { 'a.jpg': { star: true } } });

    writeJson({ format: 'paloma-folder', version: 2, people: ['Roy'], photos: { 'a.jpg': { star: true } } });
    expect(await SidecarService.getFolderState(dir)).toMatchObject({ people: {}, photos: { 'a.jpg': { star: true } } });
  });

  it('shows Picasa faces and people live, then imports them on the first change', async () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[Contacts2]', 'b8e4117cf1d6615b=Roy Avery;;', '[a.jpg]', 'faces=rect64(579922efa1cce2aa),b8e4117cf1d6615b');

    const live = await SidecarService.getFolderState(dir);
    expect(live.people).toEqual({ b8e4117cf1d6615b: ROY });
    expect(live.photos['a.jpg'].faces).toHaveLength(1);
    expect(fs.existsSync(sidecarPath())).toBe(false);

    await SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });
    const saved = readJson();
    expect(saved.people).toEqual({ b8e4117cf1d6615b: ROY });
    expect(saved.photos['a.jpg'].faces).toEqual(live.photos['a.jpg'].faces);
  });

  it('re-imports renamed people and never removes a person', async () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[Contacts2]', 'b8e4117cf1d6615b=Roy Avery;;', '0123456789abcdef=Ann;;', '[a.jpg]', 'star=yes');
    await SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });

    writeIni('[Contacts2]', 'b8e4117cf1d6615b=Roy A.;;', '[a.jpg]', 'star=yes');
    const state = await SidecarService.getFolderState(dir);

    expect(state.people).toEqual({
      b8e4117cf1d6615b: { ...ROY, name: 'Roy A.' },
      '0123456789abcdef': { name: 'Ann', email: null, googleId: null },
    });
    expect(readJson().people).toEqual(state.people);
  });
});

describe('clearing embedded text', () => {
  beforeEach(() => touch('a.jpg'));
  const entry = () => readJson().photos['a.jpg'];

  it('writes "" when the file has an embedded description', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { caption: '', captionEmbedded: true });
    expect(entry()).toMatchObject({ caption: '' });
  });

  it('removes the caption key without an embedded description', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { caption: 'Sunrise', star: true } } });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { caption: '' });
    expect(entry()).not.toHaveProperty('caption');
  });

  it('writes [] when the file has embedded tags', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { keywords: [], keywordsEmbedded: true });
    expect(entry()).toMatchObject({ keywords: [] });
  });

  it('removes the keywords key without embedded tags', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { keywords: ['old'], star: true } } });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { keywords: [] });
    expect(entry()).not.toHaveProperty('keywords');
  });

  it('drops later duplicates ignoring case', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { keywords: ['Київ', 'київ', 'Lviv'] });
    expect(entry().keywords).toEqual(['Київ', 'Lviv']);
  });
});

const ANN = '0123456789abcdef';
const RECT = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 };
const IGNORED = { rect: { left: 0.5, top: 0.5, right: 0.6, bottom: 0.6 }, ignored: true };

describe('marks', () => {
  beforeEach(() => touch('a.jpg'));
  const entry = () => readJson().photos['a.jpg'];

  it('adds a person without a rectangle', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { addMark: { person: ANN } });
    expect(entry()).toEqual({ faces: [{ person: ANN }], modified: expect.any(String) });
  });

  it('adds a detected face with its rectangle', async () => {
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { addMark: { person: ANN, rect: RECT } });
    expect(entry().faces).toEqual([{ rect: RECT, person: ANN }]);
  });

  it('treats a mark that is already there as no change', async () => {
    expect(withMark([FACE], { person: FACE.person })).toBeUndefined();
    expect(withMark([FACE], { person: FACE.person, rect: { ...FACE.rect } })).toBeUndefined();
  });

  it('replaces a mark without a rectangle by one with a rectangle', async () => {
    expect(withMark([{ person: ANN }, IGNORED], { person: ANN, rect: RECT })).toEqual([IGNORED, { rect: RECT, person: ANN }]);
  });

  it('keeps faces it does not understand', async () => {
    expect(withMark([{ person: 5 }], { person: ANN })).toEqual([{ person: 5 }, { person: ANN }]);
  });

  it('removes every face of a person and keeps ignored faces', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { faces: [FACE, IGNORED, { ...FACE, rect: RECT }] } } });

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { removePerson: FACE.person });

    expect(entry()).toEqual({ faces: [IGNORED], modified: expect.any(String) });
    expect(withoutPerson([IGNORED], FACE.person)).toBeUndefined();
  });

  it('removes the faces key when the last face goes', async () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { faces: [FACE], star: true } } });
    await SidecarService.updatePhotoFields(dir, 'a.jpg', { removePerson: FACE.person });
    expect(entry()).not.toHaveProperty('faces');
  });

  it('imports the Picasa .ini on the first mark in a Picasa folder', async () => {
    writeIni('[Contacts2]', 'b8e4117cf1d6615b=Roy Avery;;', '[b.jpg]', 'star=yes');

    await SidecarService.updatePhotoFields(dir, 'a.jpg', { addMark: { person: ANN } });

    const saved = readJson();
    expect(saved.iniHash).toEqual(expect.any(String));
    expect(saved.people).toEqual({ b8e4117cf1d6615b: ROY });
    expect(saved.photos['b.jpg']).toEqual({ star: true });
    expect(saved.photos['a.jpg']).toEqual({ faces: [{ person: ANN }], modified: expect.any(String) });
  });
});
