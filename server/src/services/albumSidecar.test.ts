import { describe, it, expect } from 'vitest';
import type { PalomaFolderFile } from '../../../shared/types.js';
import {
  addToAlbum, createAlbum, deleteAlbum, editAlbum, localIsoWithOffset, newAlbumToken, removeFromAlbum,
} from './albumSidecar.js';

const T = 'c9ea9fa67022f38a3c771894d2a8a468';
const NOW = '2026-10-04T14:20:00.000Z';
const file = (rest: Partial<PalomaFolderFile> = {}): PalomaFolderFile => ({ format: 'paloma-folder', version: 2, photos: {}, ...rest });

describe('helpers', () => {
  it('makes 32-hex tokens', () => {
    expect(newAlbumToken()).toMatch(/^[0-9a-f]{32}$/);
    expect(newAlbumToken()).not.toBe(newAlbumToken());
  });

  it('formats a local date with its offset', () => {
    expect(localIsoWithOffset(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});

describe('createAlbum', () => {
  it('defines the album and adds the photos with modified', () => {
    const result = createAlbum(
      file({ photos: { 'a.jpg': { star: true, rotate: 90 } } }),
      T,
      { name: 'Trip', date: '2026-10-04T17:20:00+03:00', description: 'Summer', location: '' },
      ['a.jpg', 'b.jpg'],
      NOW,
    );
    expect(result.albums).toEqual({ [T]: { name: 'Trip', date: '2026-10-04T17:20:00+03:00', description: 'Summer', modified: NOW } });
    expect(result.photos).toEqual({
      'a.jpg': { star: true, rotate: 90, albums: [T], modified: NOW },
      'b.jpg': { albums: [T], modified: NOW },
    });
  });
});

describe('addToAlbum', () => {
  it('copies the shown definition without cover into a folder that has none', () => {
    const result = addToAlbum(file(), T, { name: 'Birds', date: 'd', cover: 'x.jpg', modified: 'm' }, ['a.jpg'], NOW);
    expect(result.albums).toEqual({ [T]: { name: 'Birds', date: 'd', modified: 'm' } });
    expect(result.photos['a.jpg']).toEqual({ albums: [T], modified: NOW });
  });

  it('keeps an existing copy and leaves photos already in the album untouched', () => {
    const data = file({ albums: { [T]: { name: 'Mine', extra: { k: 1 } } }, photos: { 'a.jpg': { albums: [T] } } });
    const result = addToAlbum(data, T, { name: 'Other' }, ['a.jpg'], NOW);
    expect(result).toEqual(data);
  });
});

describe('removeFromAlbum', () => {
  it('removes an emptied entry without iniHash and keeps it with modified when there is one', () => {
    const photos = { 'a.jpg': { albums: [T] }, 'b.jpg': { albums: [T, 'other'] } };
    expect(removeFromAlbum(file({ photos }), T, ['a.jpg', 'b.jpg'], NOW).photos).toEqual({
      'b.jpg': { albums: ['other'], modified: NOW },
    });
    expect(removeFromAlbum(file({ iniHash: 'h', photos }), T, ['a.jpg'], NOW).photos['a.jpg']).toEqual({ modified: NOW });
  });
});

describe('editAlbum', () => {
  const shown = { name: 'New', date: 'd', description: 'Desc', location: null };

  it('writes the shown fields into a stale copy and keeps unknown keys', () => {
    const data = file({ albums: { [T]: { name: 'Stale', location: 'Old', extra: { k: 1 } } } });
    expect(editAlbum(data, T, shown, undefined, NOW).albums).toEqual({
      [T]: { name: 'New', date: 'd', description: 'Desc', extra: { k: 1 }, modified: NOW },
    });
  });

  it('removes an empty description or location', () => {
    const data = file({ albums: { [T]: { name: 'A', description: 'x', location: 'y' } } });
    expect(editAlbum(data, T, { name: 'A', date: null, description: '', location: null }, undefined, NOW).albums![T])
      .toEqual({ name: 'A', modified: NOW });
  });

  it('sets the cover only where asked and removes it elsewhere', () => {
    const data = file({ albums: { [T]: { name: 'A', cover: 'old.jpg' } } });
    expect(editAlbum(data, T, shown, 'b.jpg', NOW).albums![T].cover).toBe('b.jpg');
    expect(editAlbum(data, T, shown, null, NOW).albums![T]).not.toHaveProperty('cover');
    expect(editAlbum(data, T, shown, undefined, NOW).albums![T].cover).toBe('old.jpg');
  });
});

describe('deleteAlbum', () => {
  it('removes the definition and the token from every entry, including missing files', () => {
    const data = file({
      iniHash: 'h',
      albums: { [T]: { name: 'A' }, other: { name: 'B' } },
      photos: { 'gone.jpg': { albums: [T] }, 'a.jpg': { albums: [T, 'other'], star: true }, 'b.jpg': { star: true } },
    });
    const result = deleteAlbum(data, T, NOW);
    expect(result.albums).toEqual({ other: { name: 'B' } });
    expect(result.photos).toEqual({
      'gone.jpg': { modified: NOW },
      'a.jpg': { albums: ['other'], star: true, modified: NOW },
      'b.jpg': { star: true },
    });
  });
});
