import { describe, it, expect, beforeEach } from 'vitest';
import { NAV_ITEMS, navItemsFor } from './navigation.js';
import { TRAY_ACTION_IDS, trayActionApplies, trayActionsFor } from './useTray.js';
import { sidebarListsFor, toggleSidebarList } from './sidebar.js';
import { DEFAULT_UI_SETTINGS, useUiSettings } from '../settings/uiSettings.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

describe('shared shell lists', () => {
  it('offers every view in the navigation', () => {
    expect(NAV_ITEMS.map((item) => item.view)).toEqual(['library', 'people', 'map', 'collage', 'plugins', 'settings']);
    for (const item of NAV_ITEMS) expect(item.labelKey).toBe(`nav.${item.view}`);
  });

  it('knows every tray action', () => {
    expect([...TRAY_ACTION_IDS]).toEqual([
      'addToAlbum', 'addTags', 'removeTag', 'removeFromAlbum', 'makeCover', 'removeLocation', 'clear', 'export', 'print', 'collage',
      'movie',
    ]);
  });
});

describe('shell lists by level', () => {
  it('shows Child only the library and settings, the album list and no tray actions', () => {
    expect(navItemsFor('child').map((item) => item.view)).toEqual(['library', 'settings']);
    expect(sidebarListsFor('child')).toEqual(['albums']);
    expect(trayActionsFor('child')).toEqual([]);
  });

  it('shows Easy the album, export and print actions but not the advanced ones', () => {
    expect(navItemsFor('easy').map((item) => item.view)).toEqual(['library', 'settings']);
    expect(sidebarListsFor('easy')).toEqual(['shortcuts', 'memories', 'albums', 'tags', 'people', 'folders']);
    expect(trayActionsFor('easy')).toEqual(['addToAlbum', 'addTags', 'removeTag', 'removeFromAlbum', 'makeCover', 'clear', 'export', 'print']);
  });

  it('shows Normal and above everything', () => {
    for (const level of ['normal', 'pro', 'developer'] as const) {
      expect(navItemsFor(level)).toEqual(NAV_ITEMS);
      expect(trayActionsFor(level)).toEqual([...TRAY_ACTION_IDS]);
    }
  });
});

describe('collapsing sidebar lists', () => {
  beforeEach(() => {
    useUiSettings.setState({ ...DEFAULT_UI_SETTINGS });
    usePalomaStore.setState({ selectedFolderId: 3, selectedAlbumToken: null, selectedFilter: 'all' });
  });

  it('collapses and expands one list at a time', () => {
    toggleSidebarList('folders');
    expect(useUiSettings.getState().collapsedSidebarLists).toEqual(['folders']);
    toggleSidebarList('albums');
    expect(useUiSettings.getState().collapsedSidebarLists).toEqual(['folders', 'albums']);
    toggleSidebarList('folders');
    expect(useUiSettings.getState().collapsedSidebarLists).toEqual(['albums']);
  });

  it('leaves the selected folder, album and filter alone', () => {
    toggleSidebarList('folders');
    expect(usePalomaStore.getState()).toMatchObject({ selectedFolderId: 3, selectedAlbumToken: null, selectedFilter: 'all' });
  });

  it('keeps the other settings', () => {
    useUiSettings.getState().update({ skin: 'compact', theme: 'dark' });
    toggleSidebarList('shortcuts');
    expect(useUiSettings.getState()).toMatchObject({ skin: 'compact', theme: 'dark', collapsedSidebarLists: ['shortcuts'] });
  });
});

describe('entering Child mode', () => {
  const photo = { id: 1 } as Parameters<ReturnType<typeof usePalomaStore.getState>['toggleSelectPhoto']>[0];

  it('clears the selection, search, folder and shortcut', () => {
    usePalomaStore.setState({ selectedPhotos: [photo], searchQuery: 'cat', selectedFolderId: 3, selectedFilter: 'starred', selectedAlbumToken: null });
    usePalomaStore.getState().enterChildMode();
    expect(usePalomaStore.getState()).toMatchObject({
      selectedPhotos: [], searchQuery: '', selectedFolderId: null, selectedFilter: 'all', selectedAlbumToken: null,
    });
  });

  it('keeps an open album', () => {
    usePalomaStore.setState({ selectedPhotos: [photo], selectedFolderId: null, selectedAlbumToken: 'birds' });
    usePalomaStore.getState().enterChildMode();
    expect(usePalomaStore.getState()).toMatchObject({ selectedPhotos: [], selectedAlbumToken: 'birds' });
  });
});

describe('tray actions by view', () => {
  const base = { selectedCount: 2, geotaggedCount: 0, inAlbum: false, inTag: false };

  it('offers Remove tag only while a tag is open', () => {
    expect(trayActionApplies({ ...base, inTag: true }).removeTag).toBe(true);
    expect(trayActionApplies(base).removeTag).toBe(false);
    expect(trayActionApplies({ ...base, inAlbum: true }).removeTag).toBe(false);
  });

  it('offers Add tags in every view', () => {
    expect(trayActionApplies(base).addTags).toBe(true);
    expect(trayActionApplies({ ...base, inTag: true }).addTags).toBe(true);
  });

  it('never offers either at Child', () => {
    expect(trayActionsFor('child')).not.toContain('removeTag');
    expect(trayActionsFor('child')).not.toContain('addTags');
  });
});

describe('tag selection in the sidebar', () => {
  it('replaces a chosen album and is cleared by choosing a folder', () => {
    usePalomaStore.getState().setSelectedAlbum('c9ea');
    usePalomaStore.getState().setSelectedTag('dawn');
    expect(usePalomaStore.getState()).toMatchObject({ selectedTag: 'dawn', selectedAlbumToken: null });
    usePalomaStore.getState().setSelectedFolderId(1);
    expect(usePalomaStore.getState().selectedTag).toBeNull();
  });
});
