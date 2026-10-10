import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchPhotoStats, libraryQueryParams } from './library.js';

const NONE = { selectedFolderId: null, selectedAlbumToken: null, selectedTag: null, selectedFilter: 'all' as const, searchQuery: '' };

describe('libraryQueryParams', () => {
  it('sends only the language for the whole library', () => {
    expect(libraryQueryParams(NONE, 'uk').toString()).toBe('lang=uk');
  });

  it('adds the folder, album, collection and trimmed search text', () => {
    expect(Object.fromEntries(libraryQueryParams({ ...NONE, selectedFolderId: 3, searchQuery: ' lviv ' }, 'en')))
      .toEqual({ folderId: '3', query: 'lviv', lang: 'en' });
    expect(Object.fromEntries(libraryQueryParams({ ...NONE, selectedAlbumToken: 'c9ea' }, 'en'))).toEqual({ album: 'c9ea', lang: 'en' });
    expect(libraryQueryParams({ ...NONE, selectedFilter: 'starred' }, 'en').get('starred')).toBe('true');
    expect(libraryQueryParams({ ...NONE, selectedFilter: 'geotagged' }, 'en').get('geotagged')).toBe('true');
    expect(Object.fromEntries(libraryQueryParams({ ...NONE, selectedTag: 'Dawn' }, 'en'))).toEqual({ tag: 'Dawn', lang: 'en' });
    expect(Object.fromEntries(libraryQueryParams({ ...NONE, selectedPerson: 'b8e4117cf1d6615b', searchQuery: 'beach' }, 'en')))
      .toEqual({ person: 'b8e4117cf1d6615b', query: 'beach', lang: 'en' });
  });

  it('adds the date range of a memory', () => {
    expect(Object.fromEntries(libraryQueryParams(
      { ...NONE, selectedMemory: { year: 2016, yearsAgo: 10, from: '2016-10-03', to: '2016-10-09', album: null, title: null }, searchQuery: 'bridge' }, 'en',
    ))).toEqual({ takenFrom: '2016-10-03', takenTo: '2016-10-09', query: 'bridge', lang: 'en' });
  });
});

describe('fetchPhotoStats', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('asks for the totals of the selection', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ photoCount: 2 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchPhotoStats({ ...NONE, selectedAlbumToken: 'c9ea' }, 'en')).toEqual({ photoCount: 2 });
    expect(fetchMock).toHaveBeenCalledWith('/api/photos/stats?album=c9ea&lang=en', expect.objectContaining({ method: 'GET' }));
  });
});
