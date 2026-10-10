import { describe, it, expect, beforeEach } from 'vitest';
import { libraryQueryParams } from '../api/library.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { entryListAllowed, entrySelection, openEntry, type LibraryEntry } from './entries.js';

const memory = { year: 2016, yearsAgo: 10, from: '2016-10-03', to: '2016-10-09', album: null, title: null };
const params = (entry: LibraryEntry) => Object.fromEntries(libraryQueryParams(entrySelection(entry), 'en'));

describe('entrySelection', () => {
  it('selects exactly the entry, without search text', () => {
    usePalomaStore.setState({ searchQuery: 'beach' });
    expect(params({ kind: 'folder', id: 3 })).toEqual({ folderId: '3', lang: 'en' });
    expect(params({ kind: 'album', token: 'c9ea' })).toEqual({ album: 'c9ea', lang: 'en' });
    expect(params({ kind: 'tag', name: 'river' })).toEqual({ tag: 'river', lang: 'en' });
    expect(params({ kind: 'person', id: 'b8e4117cf1d6615b' })).toEqual({ person: 'b8e4117cf1d6615b', lang: 'en' });
    expect(params({ kind: 'memory', memory })).toEqual({ takenFrom: '2016-10-03', takenTo: '2016-10-09', lang: 'en' });
    expect(params({ kind: 'shortcut', filter: 'starred' })).toEqual({ starred: 'true', lang: 'en' });
    expect(params({ kind: 'shortcut', filter: 'all' })).toEqual({ lang: 'en' });
  });
});

describe('openEntry', () => {
  beforeEach(() => usePalomaStore.getState().setSelectedFilter('all'));

  it('opens the entry as the sidebar does, replacing the previous one', () => {
    openEntry({ kind: 'folder', id: 3 });
    expect(usePalomaStore.getState().selectedFolderId).toBe(3);
    openEntry({ kind: 'album', token: 'c9ea' });
    expect(usePalomaStore.getState()).toMatchObject({ selectedAlbumToken: 'c9ea', selectedFolderId: null });
    openEntry({ kind: 'tag', name: 'river' });
    expect(usePalomaStore.getState()).toMatchObject({ selectedTag: 'river', selectedAlbumToken: null });
    openEntry({ kind: 'person', id: 'b8e4117cf1d6615b' });
    expect(usePalomaStore.getState()).toMatchObject({ selectedPerson: 'b8e4117cf1d6615b', selectedTag: null });
    openEntry({ kind: 'memory', memory });
    expect(usePalomaStore.getState()).toMatchObject({ selectedMemory: memory, selectedPerson: null });
    openEntry({ kind: 'shortcut', filter: 'geotagged' });
    expect(usePalomaStore.getState()).toMatchObject({ selectedFilter: 'geotagged', selectedMemory: null });
  });
});

describe('entryListAllowed', () => {
  it('follows the level of each sidebar list', () => {
    const kinds = ['album', 'folder', 'tag', 'memory', 'shortcut', 'person'] as const;
    expect(kinds.map((kind) => entryListAllowed('child', kind))).toEqual([true, false, false, false, false, false]);
    expect(kinds.map((kind) => entryListAllowed('easy', kind))).toEqual([true, true, true, true, true, true]);
  });
});
