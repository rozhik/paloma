import { describe, it, expect, beforeEach } from 'vitest';
import { NAV_ITEMS } from './navigation.js';
import { TRAY_ACTION_IDS } from './useTray.js';
import { toggleSidebarList } from './sidebar.js';
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
