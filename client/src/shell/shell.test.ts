import { describe, it, expect, beforeEach } from 'vitest';
import { NAV_ITEMS, navItemsFor } from './navigation.js';
import { TRAY_ACTION_IDS, trayActionsFor } from './useTray.js';
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
      'addToAlbum', 'removeFromAlbum', 'makeCover', 'removeLocation', 'clear', 'export', 'print', 'collage', 'movie',
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
    expect(sidebarListsFor('easy')).toEqual(['shortcuts', 'albums', 'folders']);
    expect(trayActionsFor('easy')).toEqual(['addToAlbum', 'removeFromAlbum', 'makeCover', 'clear', 'export', 'print']);
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
