import { describe, it, expect } from 'vitest';
import { libraryQueryParams } from './library.js';

const NONE = { selectedFolderId: null, selectedAlbumToken: null, selectedFilter: 'all' as const, searchQuery: '' };

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
  });
});
