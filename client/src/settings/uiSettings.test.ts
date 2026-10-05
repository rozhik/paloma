import { describe, it, expect } from 'vitest';
import {
  type UiSettings, DEFAULT_UI_SETTINGS, UI_SETTINGS_STORAGE_KEY, loadUiSettings, parseUiSettings, saveUiSettings,
} from './uiSettings.js';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
  };
}

const throwing = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

describe('UI settings', () => {
  it('defaults to the navigation bar on top and the edit bar on the left, Classic and the system theme', () => {
    expect(DEFAULT_UI_SETTINGS).toEqual({
      navBar: 'top', editBar: 'left', skin: 'classic', theme: 'system', sidebarCollapsed: false, collapsedSidebarLists: [],
    });
    expect(loadUiSettings(memoryStorage())).toEqual(DEFAULT_UI_SETTINGS);
    expect(loadUiSettings(null)).toEqual(DEFAULT_UI_SETTINGS);
  });

  it('remembers settings and reads them back', () => {
    const storage = memoryStorage();
    const settings = {
      ...DEFAULT_UI_SETTINGS, navBar: 'bottom', editBar: 'right', skin: 'compact', theme: 'dark',
      sidebarCollapsed: true, collapsedSidebarLists: ['albums'],
    } as const satisfies UiSettings;
    expect(saveUiSettings({ ...settings, collapsedSidebarLists: ['albums'] }, storage)).toBe(true);
    expect(JSON.parse(storage.items.get(UI_SETTINGS_STORAGE_KEY)!)).toEqual(settings);
    expect(loadUiSettings(storage)).toEqual(settings);
  });

  it('accepts both bars on the same edge', () => {
    expect(parseUiSettings('{"navBar":"bottom","editBar":"bottom"}')).toMatchObject({ navBar: 'bottom', editBar: 'bottom' });
  });

  it('replaces only the invalid value with its default', () => {
    expect(parseUiSettings('{"navBar":"middle","editBar":"right"}')).toEqual({ ...DEFAULT_UI_SETTINGS, navBar: 'top', editBar: 'right' });
    expect(parseUiSettings('{"editBar":42}')).toEqual(DEFAULT_UI_SETTINGS);
  });

  it('uses the defaults for malformed or non-object JSON', () => {
    expect(parseUiSettings('{broken')).toEqual(DEFAULT_UI_SETTINGS);
    expect(parseUiSettings('"top"')).toEqual(DEFAULT_UI_SETTINGS);
    expect(parseUiSettings('null')).toEqual(DEFAULT_UI_SETTINGS);
  });

  it('keeps working when the browser cannot store anything', () => {
    expect(loadUiSettings(throwing)).toEqual(DEFAULT_UI_SETTINGS);
    expect(saveUiSettings({ ...DEFAULT_UI_SETTINGS, navBar: 'left', editBar: 'top' }, throwing)).toBe(false);
  });

  it('uses Classic for an unknown skin and keeps the theme', () => {
    expect(parseUiSettings('{"skin":"neon","theme":"dark"}')).toMatchObject({ skin: 'classic', theme: 'dark' });
  });

  it('uses the system theme for an unknown theme and keeps the skin', () => {
    expect(parseUiSettings('{"skin":"glass","theme":"sepia"}')).toMatchObject({ skin: 'glass', theme: 'system' });
  });

  it('reads settings stored before skins and themes existed', () => {
    expect(parseUiSettings('{"navBar":"bottom","editBar":"right"}')).toEqual({ ...DEFAULT_UI_SETTINGS, navBar: 'bottom', editBar: 'right' });
  });

  it('drops unknown and repeated sidebar lists', () => {
    expect(parseUiSettings('{"collapsedSidebarLists":["albums","people","albums",3,"folders"]}').collapsedSidebarLists)
      .toEqual(['albums', 'folders']);
    expect(parseUiSettings('{"collapsedSidebarLists":"albums"}').collapsedSidebarLists).toEqual([]);
    expect(parseUiSettings('{"sidebarCollapsed":"yes"}').sidebarCollapsed).toBe(false);
  });
});
