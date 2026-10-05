import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SidecarService, SidecarUnreadableError } from './SidecarService.js';
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

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_sidecar_test_'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.chmodSync(dir, 0o755);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('readFolderSidecar', () => {
  it('reports a missing file', () => {
    expect(SidecarService.readFolderSidecar(dir)).toEqual({ kind: 'missing' });
  });

  it('reads a valid v2 file and treats absent photos as empty', () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { star: true } } });
    expect(SidecarService.readFolderSidecar(dir)).toMatchObject({ kind: 'ok', data: { photos: { 'a.jpg': { star: true } } } });

    writeJson({ format: 'paloma-folder', version: 2 });
    expect(SidecarService.readFolderSidecar(dir)).toMatchObject({ kind: 'ok', data: { photos: {} } });
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
  ])('reports %s as unreadable', (_, content) => {
    fs.writeFileSync(sidecarPath(), content);
    expect(SidecarService.readFolderSidecar(dir).kind).toBe('unreadable');
  });
});

describe('fieldsOf', () => {
  it('reads fields of the wrong type as absent', () => {
    expect(SidecarService.fieldsOf({ star: 'yes', hidden: 1, caption: 5, keywords: 'a,b' } as unknown as PalomaPhotoEntry)).toEqual({});
    expect(SidecarService.fieldsOf({ caption: '', keywords: ['a', 3, '', 'b'] } as unknown as PalomaPhotoEntry)).toEqual({ keywords: ['a', 'b'] });
    expect(SidecarService.fieldsOf({ star: true, hidden: true, caption: 'x', modified: 't', rotate: 90 }))
      .toEqual({ star: true, hidden: true, caption: 'x' });
  });

  it('reads albums as a list of tokens without empty items or duplicates', () => {
    expect(SidecarService.fieldsOf({ albums: ['c9ea', '', 'c9ea', 3, '7f01'] } as unknown as PalomaPhotoEntry))
      .toEqual({ albums: ['c9ea', '7f01'] });
    expect(SidecarService.fieldsOf({ albums: 'c9ea' } as unknown as PalomaPhotoEntry)).toEqual({});
  });
});

describe('reimport', () => {
  const base = (photos: PalomaFolderFile['photos']): PalomaFolderFile =>
    ({ format: 'paloma-folder', version: 2, iniHash: 'old', photos });

  it('makes unmodified entries follow the .ini and keeps their other keys', () => {
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

  it('adds entries for new sections', () => {
    const result = SidecarService.reimport(base({}), { 'd.jpg': { star: true } }, 'new');
    expect(result.photos).toEqual({ 'd.jpg': { star: true } });
  });

  it('keeps entries changed in Paloma and logs a conflict', () => {
    const entry = { caption: 'Mine', modified: '2026-10-04T10:00:00.000Z' };
    const result = SidecarService.reimport(base({ 'a.jpg': entry }), { 'a.jpg': { caption: 'Theirs' } }, 'new');
    expect(result.photos['a.jpg']).toEqual(entry);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Conflict'));
  });

  it('does not log a conflict when a changed entry agrees with the .ini', () => {
    SidecarService.reimport(base({ 'a.jpg': { star: true, modified: 't' } }), { 'a.jpg': { star: true } }, 'new');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('makes memberships of unmodified entries follow the .ini', () => {
    const result = SidecarService.reimport(
      base({ 'a.jpg': { albums: ['old'] }, 'b.jpg': { albums: ['mine'], modified: 't' } }),
      { 'a.jpg': { albums: ['new'] }, 'b.jpg': { albums: ['new'] } },
      'new',
    );
    expect(result.photos).toEqual({ 'a.jpg': { albums: ['new'] }, 'b.jpg': { albums: ['mine'], modified: 't' } });
  });

  it('re-imports album definitions without removing any', () => {
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

  it('keeps unknown top-level sections', () => {
    const result = SidecarService.reimport({ ...base({}), albums: { x: {} } }, {}, 'new');
    expect(result.albums).toEqual({ x: {} });
  });
});

describe('getFolderState', () => {
  it('reads the fields from .paloma.json', () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { star: true, caption: 'Sunrise' }, 'b.jpg': { rotate: 90 } } });
    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'a.jpg': { star: true, caption: 'Sunrise' } });
  });

  it('shows a Picasa folder live without writing anything', () => {
    touch('img_0042.jpg');
    writeIni('[IMG_0042.JPG]', 'star=yes', '[gone.jpg]', 'caption=x');
    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'img_0042.jpg': { star: true }, 'gone.jpg': { caption: 'x' } });
    expect(fs.existsSync(sidecarPath())).toBe(false);
  });

  it('returns album definitions from .paloma.json', () => {
    writeJson({ format: 'paloma-folder', version: 2, albums: { c9ea: { name: 'Birds', cover: 'a.jpg' } }, photos: { 'a.jpg': { albums: ['c9ea'] } } });
    expect(SidecarService.getFolderState(dir)).toEqual({
      photos: { 'a.jpg': { albums: ['c9ea'] } },
      albums: { c9ea: { name: 'Birds', cover: 'a.jpg' } },
    });
  });

  it('shows Picasa albums live without writing anything', () => {
    touch('a.jpg');
    writeIni('[.album:c9ea]', 'name= Birds', 'token=c9ea', '[a.jpg]', 'albums=c9ea');
    expect(SidecarService.getFolderState(dir)).toEqual({
      photos: { 'a.jpg': { albums: ['c9ea'] } },
      albums: { c9ea: { name: ' Birds' } },
    });
    expect(fs.existsSync(sidecarPath())).toBe(false);
  });

  it('re-imports a changed .ini into the sidecar', () => {
    writeIni('[a.jpg]', 'star=yes', '[d.jpg]', 'star=yes');
    writeJson({ format: 'paloma-folder', version: 2, iniHash: 'stale', photos: { 'a.jpg': { star: true } } });

    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'a.jpg': { star: true }, 'd.jpg': { star: true } });
    const written = readJson();
    expect(written.photos['d.jpg']).toEqual({ star: true });
    expect(written.iniHash).toBe(sha256(fs.readFileSync(path.join(dir, '.picasa.ini'))));
  });

  it('leaves the sidecar alone when the .ini is unchanged or deleted', () => {
    const bytes = writeIni('[a.jpg]', 'star=yes');
    writeJson({ format: 'paloma-folder', version: 2, iniHash: sha256(bytes), photos: { 'a.jpg': { caption: 'x' } } });
    const before = fs.readFileSync(sidecarPath(), 'utf-8');

    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'a.jpg': { caption: 'x' } });
    fs.rmSync(path.join(dir, '.picasa.ini'));
    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'a.jpg': { caption: 'x' } });
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe(before);
  });

  it('ignores the .ini when there is a sidecar without iniHash', () => {
    writeIni('[a.jpg]', 'star=yes');
    writeJson({ format: 'paloma-folder', version: 2, photos: {} });
    expect(SidecarService.getFolderState(dir).photos).toEqual({});
  });

  it('gives no fields for an unreadable sidecar, ignores the .ini and keeps the file', () => {
    writeIni('[a.jpg]', 'star=yes');
    fs.writeFileSync(sidecarPath(), '{broken');
    expect(SidecarService.getFolderState(dir)).toEqual({ photos: {}, albums: {} });
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe('{broken');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('.paloma.json'));
  });
});

describe('updatePhotoFields', () => {
  it('creates a new sidecar with the exact expected content', () => {
    vi.useFakeTimers({ now: new Date('2026-10-04T14:20:00.000Z'), toFake: ['Date'] });
    try {
      SidecarService.updatePhotoFields(dir, 'IMG_0042.jpg', { star: true });
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

  it('stores all fields and clears them with false, empty string and empty list', () => {
    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true, hidden: true, caption: 'Sunrise', keywords: ['mountains', 'dawn'] });
    expect(readJson().photos['a.jpg']).toMatchObject({ star: true, hidden: true, caption: 'Sunrise', keywords: ['mountains', 'dawn'] });

    SidecarService.updatePhotoFields(dir, 'a.jpg', { hidden: false, caption: '' });
    expect(SidecarService.fieldsOf(readJson().photos['a.jpg'])).toEqual({ star: true, keywords: ['mountains', 'dawn'] });
  });

  it('removes an emptied entry when there is no iniHash', () => {
    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: false });
    expect(readJson().photos).toEqual({});
  });

  it('imports the Picasa .ini on the first change, including sections for missing files', () => {
    touch('a.jpg', 'b.jpg', 'c.jpg');
    const bytes = writeIni('[a.jpg]', 'caption=Sunrise', '[b.jpg]', 'star=yes', '[gone.jpg]', 'star=yes', '[x.jpg]', 'filters=enhance=1;');
    const iniBefore = fs.readFileSync(path.join(dir, '.picasa.ini'));

    SidecarService.updatePhotoFields(dir, 'c.jpg', { star: true });

    const written = readJson();
    expect(Object.keys(written)).toEqual(['format', 'version', 'iniHash', 'photos']);
    expect(written.iniHash).toBe(sha256(bytes));
    expect(written.photos).toEqual({
      'a.jpg': { caption: 'Sunrise' },
      'b.jpg': { star: true },
      'c.jpg': { star: true, modified: expect.any(String) },
      'gone.jpg': { star: true },
    });
    expect(fs.readFileSync(path.join(dir, '.picasa.ini')).equals(iniBefore)).toBe(true);
  });

  it('imports Picasa album definitions and memberships on the first change', () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[.album:c9ea]', 'name=Birds', 'token=c9ea', '[.album:7f01]', 'token=7f01', '[a.jpg]', 'albums=c9ea');

    SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });

    const written = readJson();
    expect(Object.keys(written)).toEqual(['format', 'version', 'iniHash', 'albums', 'photos']);
    expect(written.albums).toEqual({ c9ea: { name: 'Birds' }, '7f01': {} });
    expect(written.photos['a.jpg']).toEqual({ albums: ['c9ea'] });
    expect(written.photos['b.jpg']).toEqual({ star: true, modified: expect.any(String) });
  });

  it('keeps an unstarred imported entry with modified so a re-import does not bring the star back', () => {
    touch('a.jpg');
    writeIni('[a.jpg]', 'star=yes');
    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: false });
    expect(readJson().photos['a.jpg']).toEqual({ modified: expect.any(String) });

    writeIni('[a.jpg]', 'star=yes', '[b.jpg]', 'star=yes');
    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'b.jpg': { star: true } });
    expect(fs.readFileSync(path.join(dir, '.picasa.ini'), 'utf-8')).toContain('[b.jpg]');
  });

  it('re-imports a changed .ini before applying the change', () => {
    writeIni('[a.jpg]', 'star=yes');
    SidecarService.updatePhotoFields(dir, 'b.jpg', { caption: 'x' });
    writeIni('[a.jpg]', 'star=yes', '[d.jpg]', 'hidden=yes');

    SidecarService.updatePhotoFields(dir, 'b.jpg', { caption: 'y' });

    const written = readJson();
    expect(written.photos['d.jpg']).toEqual({ hidden: true });
    expect(written.photos['b.jpg'].caption).toBe('y');
  });

  it('preserves unknown top-level sections and entry keys', () => {
    writeJson({
      format: 'paloma-folder',
      version: 2,
      albums: { c9ea: { name: ' Birds' } },
      photos: { 'a.jpg': { rotate: 90, edits: [{ filter: 'autolight' }] }, 'z.jpg': { star: true } },
      extra: { encoding: { utf8: '1' } },
    });
    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });

    const written = readJson();
    expect(Object.keys(written)).toEqual(['format', 'version', 'albums', 'photos', 'extra']);
    expect(written.albums).toEqual({ c9ea: { name: ' Birds' } });
    expect(written.extra).toEqual({ encoding: { utf8: '1' } });
    expect(written.photos['a.jpg']).toMatchObject({ rotate: 90, edits: [{ filter: 'autolight' }], star: true });
    expect(written.photos['z.jpg']).toEqual({ star: true });
  });

  it('keeps photo keys in a stable order', () => {
    SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });
    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    expect(Object.keys(readJson().photos)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('refuses to touch an unreadable sidecar', () => {
    fs.writeFileSync(sidecarPath(), JSON.stringify({ version: '1.0', photos: {} }));
    const before = fs.readFileSync(sidecarPath(), 'utf-8');

    expect(() => SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true })).toThrow(SidecarUnreadableError);
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe(before);
  });

  it('refuses to touch a sidecar with a malformed albums section', () => {
    writeJson({ format: 'paloma-folder', version: 2, albums: ['Birds'], photos: { 'a.jpg': { star: true } } });
    const before = fs.readFileSync(sidecarPath(), 'utf-8');

    expect(SidecarService.getFolderState(dir)).toEqual({ photos: {}, albums: {} });
    expect(() => SidecarService.updatePhotoFields(dir, 'a.jpg', { caption: 'x' })).toThrow(SidecarUnreadableError);
    expect(fs.readFileSync(sidecarPath(), 'utf-8')).toBe(before);
  });

  it.skipIf(process.getuid?.() === 0)('throws in a read-only folder and leaves no temp file', () => {
    fs.chmodSync(dir, 0o555);
    expect(() => SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true })).toThrow();
    fs.chmodSync(dir, 0o755);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('removes the temp file when the rename fails', () => {
    fs.mkdirSync(sidecarPath()); // a directory in the way makes rename fail after the temp file was written
    fs.writeFileSync(path.join(sidecarPath(), 'keep'), '');
    vi.spyOn(SidecarService, 'readFolderSidecar').mockReturnValue({ kind: 'missing' });

    expect(() => SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true })).toThrow();
    expect(fs.readdirSync(dir)).toEqual(['.paloma.json']);
  });
});

describe('geotag', () => {
  it('reads a valid geotag and null, and treats any other value as absent', () => {
    expect(SidecarService.fieldsOf({ geotag: { lat: 50.45, lon: 30.5234 } })).toEqual({ geotag: { lat: 50.45, lon: 30.5234 } });
    expect(SidecarService.fieldsOf({ geotag: null })).toEqual({ geotag: null });
    for (const geotag of [{ lat: 95, lon: 10 }, { lat: '50', lon: 30 }, { lat: 50 }, [50, 30], '50,30', { lat: 0, lon: 200 }]) {
      expect(SidecarService.fieldsOf({ geotag } as unknown as PalomaPhotoEntry), JSON.stringify(geotag)).toEqual({});
    }
  });

  it('writes a rounded geotag, null, and deletes the key', () => {
    SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: { lat: 48.1608334999, lon: 24.50027777 } });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: { lat: 48.160833, lon: 24.500278 }, modified: expect.any(String) });

    SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: null });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: null, modified: expect.any(String) });

    SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: false });
    expect(readJson().photos).toEqual({});
  });

  it('keeps an invalid geotag in the file until the location is changed', () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { geotag: { lat: 95, lon: 10 } } } });
    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    expect(readJson().photos['a.jpg'].geotag).toEqual({ lat: 95, lon: 10 });
    expect(SidecarService.getFolderState(dir).photos['a.jpg']).toEqual({ star: true });
  });

  it('saves several photos of a folder in one write with the same modified time', () => {
    SidecarService.updatePhotosFields(dir, { 'a.jpg': { geotag: { lat: 1, lon: 2 } }, 'b.jpg': { geotag: { lat: 1, lon: 2 }, caption: 'x' } });
    const { photos } = readJson();
    expect(photos['a.jpg']).toEqual({ geotag: { lat: 1, lon: 2 }, modified: expect.any(String) });
    expect(photos['b.jpg']).toEqual({ geotag: { lat: 1, lon: 2 }, caption: 'x', modified: photos['a.jpg'].modified });
  });

  it('imports a Picasa geotag on the first change and shows it live before', () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[a.jpg]', 'geotag=33.770556,-84.293055');
    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'a.jpg': { geotag: { lat: 33.770556, lon: -84.293055 } } });
    expect(fs.existsSync(sidecarPath())).toBe(false);

    SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: { lat: 33.770556, lon: -84.293055 } });
  });

  it('re-imports a changed Picasa geotag into an unmodified entry', () => {
    touch('a.jpg', 'b.jpg');
    writeIni('[a.jpg]', 'geotag=10,20');
    SidecarService.updatePhotoFields(dir, 'b.jpg', { star: true });

    writeIni('[a.jpg]', 'geotag=11,21');
    expect(SidecarService.getFolderState(dir).photos['a.jpg']).toEqual({ geotag: { lat: 11, lon: 21 } });

    writeIni('[a.jpg]', 'star=yes');
    expect(SidecarService.getFolderState(dir).photos['a.jpg']).toEqual({ star: true });
  });

  it('keeps a location set in Paloma when Picasa changes it, and logs a conflict', () => {
    touch('a.jpg');
    writeIni('[a.jpg]', 'geotag=10,20');
    SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: { lat: 1, lon: 2 } });

    writeIni('[a.jpg]', 'geotag=11,21');
    expect(SidecarService.getFolderState(dir).photos['a.jpg']).toEqual({ geotag: { lat: 1, lon: 2 } });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Conflict'));
  });

  it('keeps an entry with only a removed location even without iniHash', () => {
    SidecarService.updatePhotoFields(dir, 'a.jpg', { geotag: null });
    expect(readJson().photos['a.jpg']).toEqual({ geotag: null, modified: expect.any(String) });
    expect(SidecarService.getFolderState(dir).photos).toEqual({ 'a.jpg': { geotag: null } });
  });
});

describe('edits', () => {
  const CHAIN = [{ filter: 'rotate', angle: 90 }, { filter: 'sepia' }];

  it('stores the chain with modified and removes it with an empty list', () => {
    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: CHAIN });
    expect(readJson().photos['a.jpg']).toEqual({ edits: CHAIN, modified: expect.any(String) });
    expect(SidecarService.fieldsOf(readJson().photos['a.jpg'])).toEqual({ edits: CHAIN });

    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [] });
    expect(readJson().photos['a.jpg']).toEqual({ star: true, modified: expect.any(String) });
  });

  it('keeps steps of unknown filters and their unknown keys exactly', () => {
    const chain = [{ filter: 'grain', amount: 30, nested: { x: [1] }, enabled: false as const }];
    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: chain });
    expect(readJson().photos['a.jpg'].edits).toEqual(chain);
  });

  it('reads edits of the wrong type as absent and keeps them in the file until edits are saved', () => {
    writeJson({
      format: 'paloma-folder',
      version: 2,
      photos: { 'a.jpg': { edits: 'sepia' }, 'b.jpg': { edits: [{ filter: 'bw' }, { name: 'x' }] } },
    });
    expect(SidecarService.fieldsOf(readJson().photos['a.jpg'])).toEqual({});
    expect(SidecarService.fieldsOf(readJson().photos['b.jpg'])).toEqual({});

    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    expect(readJson().photos['a.jpg'].edits).toBe('sepia');
    expect(readJson().photos['b.jpg'].edits).toEqual([{ filter: 'bw' }, { name: 'x' }]);

    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [{ filter: 'bw' }] });
    expect(readJson().photos['a.jpg'].edits).toEqual([{ filter: 'bw' }]);
  });

  it('survives a Picasa re-import of an unmodified entry', () => {
    const result = SidecarService.reimport(
      { format: 'paloma-folder', version: 2, iniHash: 'old', photos: { 'a.jpg': { star: true, edits: [{ filter: 'bw' }] } } },
      { 'a.jpg': { caption: 'From Picasa' } },
      'new',
    );
    expect(result.photos['a.jpg']).toEqual({ caption: 'From Picasa', edits: [{ filter: 'bw' }] });
  });

  it('is part of the folder state', () => {
    touch('a.jpg');
    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [{ filter: 'bw' }] });
    expect(SidecarService.getFolderState(dir).photos['a.jpg']).toEqual({ edits: [{ filter: 'bw' }] });
  });
});

describe('edit history', () => {
  const HISTORY = { undo: [[], [{ filter: 'sepia' }]], redo: [[{ filter: 'sepia' }, { filter: 'bw' }]] };

  it('is stored with the edits, kept when they are removed, and removed when both lists are empty', () => {
    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [{ filter: 'sepia' }], editHistory: { undo: [[]], redo: [] } });
    expect(readJson().photos['a.jpg']).toEqual({
      edits: [{ filter: 'sepia' }], editHistory: { undo: [[]], redo: [] }, modified: expect.any(String),
    });

    // Revert: no edits, but the history keeps the reverted chain
    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [], editHistory: { undo: [[], [{ filter: 'sepia' }]], redo: [] } });
    expect(readJson().photos['a.jpg']).toEqual({
      editHistory: { undo: [[], [{ filter: 'sepia' }]], redo: [] }, modified: expect.any(String),
    });

    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [], editHistory: { undo: [], redo: [] } });
    expect(readJson().photos['a.jpg']).toBeUndefined();
  });

  it('is not a library field', () => {
    touch('a.jpg');
    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [{ filter: 'bw' }], editHistory: HISTORY });
    expect(SidecarService.fieldsOf(readJson().photos['a.jpg'])).toEqual({ edits: [{ filter: 'bw' }] });
    expect(SidecarService.getFolderState(dir).photos['a.jpg']).toEqual({ edits: [{ filter: 'bw' }] });
    expect(SidecarService.editHistoryOf(readJson().photos['a.jpg'])).toEqual(HISTORY);
  });

  it('reads a history of the wrong type as empty and keeps it until the edits are saved', () => {
    writeJson({ format: 'paloma-folder', version: 2, photos: { 'a.jpg': { editHistory: 'lost' }, 'b.jpg': { editHistory: { undo: [['x']], redo: [] } } } });
    expect(SidecarService.editHistoryOf(readJson().photos['a.jpg'])).toEqual({ undo: [], redo: [] });
    expect(SidecarService.editHistoryOf(readJson().photos['b.jpg'])).toEqual({ undo: [], redo: [] });
    expect(SidecarService.editHistoryOf(undefined)).toEqual({ undo: [], redo: [] });

    SidecarService.updatePhotoFields(dir, 'a.jpg', { star: true });
    expect(readJson().photos['a.jpg'].editHistory).toBe('lost');

    SidecarService.updatePhotoFields(dir, 'a.jpg', { edits: [{ filter: 'bw' }], editHistory: { undo: [[]], redo: [] } });
    expect(readJson().photos['a.jpg'].editHistory).toEqual({ undo: [[]], redo: [] });
  });

  it('survives a Picasa re-import of an unmodified entry', () => {
    const result = SidecarService.reimport(
      { format: 'paloma-folder', version: 2, iniHash: 'old', photos: { 'a.jpg': { star: true, editHistory: HISTORY } } },
      { 'a.jpg': { caption: 'From Picasa' } },
      'new',
    );
    expect(result.photos['a.jpg']).toEqual({ caption: 'From Picasa', editHistory: HISTORY });
  });
});

