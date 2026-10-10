import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Photo } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { entryMenuItemIds, mapEntry, playEntry } from './entryMenu.js';

const album = { kind: 'album', token: 'trip' } as const;
const photo = (id: number) => ({ id, filename: `${id}.jpg` }) as Photo;

beforeEach(() => {
  // No full screen outside a browser
  vi.stubGlobal('document', {});
  usePalomaStore.setState({ currentView: 'library', slideshow: null, selectedPhotos: [] });
  usePalomaStore.getState().setSelectedFolderId(7);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('entryMenuItemIds', () => {
  it('offers Child only the slideshow, Easy also Information, and Normal everything', () => {
    expect(entryMenuItemIds(album, 'child')).toEqual(['slideshow']);
    expect(entryMenuItemIds(album, 'easy')).toEqual(['slideshow', 'info']);
    expect(entryMenuItemIds(album, 'normal')).toEqual(['slideshow', 'findFaces', 'map', 'info', 'properties', 'delete']);
  });

  it('offers album management only for albums', () => {
    expect(entryMenuItemIds({ kind: 'folder', id: 1 }, 'developer')).toEqual(['slideshow', 'findFaces', 'map', 'info']);
  });

  it('does not offer Find faces while a run exists', () => {
    expect(entryMenuItemIds(album, 'normal', true)).not.toContain('findFaces');
  });
});

describe('playEntry', () => {
  it("plays the entry's photos and keeps what the library shows", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([photo(1), photo(2)]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await playEntry(album);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toMatch(/^\/api\/photos\?album=trip&lang=/);
    expect(usePalomaStore.getState().slideshow?.photos.map((p) => p.id)).toEqual([1, 2]);
    expect(usePalomaStore.getState()).toMatchObject({ selectedFolderId: 7, selectedAlbumToken: null, currentView: 'library' });
  });

  it('plays nothing for an entry without photos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    await playEntry(album);
    expect(usePalomaStore.getState().slideshow).toBeNull();
  });
});

describe('mapEntry', () => {
  it('opens the entry and the map', () => {
    mapEntry(album);
    expect(usePalomaStore.getState()).toMatchObject({ currentView: 'map', selectedAlbumToken: 'trip', selectedFolderId: null });
  });
});
