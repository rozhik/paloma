import { describe, it, expect } from 'vitest';
import {
  type UiSettings, DEFAULT_UI_SETTINGS, UI_SETTINGS_STORAGE_KEY, loadUiSettings, parseUiSettings, saveUiSettings, useUiSettings,
} from './uiSettings.js';
import { createPin } from '../levels/pin.js';

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
      level: 'normal', pin: null, slideshowInterval: 5,
      slideshowEffect: 'fade', slideshowEffectDuration: 1, slideshowShuffle: false, slideshowFit: 'fit', viewerOpenZoom: 'fit',
      showFaces: false, showObjects: false,
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
    expect(parseUiSettings('{"collapsedSidebarLists":["albums","places","albums",3,"folders"]}').collapsedSidebarLists)
      .toEqual(['albums', 'folders']);
    expect(parseUiSettings('{"collapsedSidebarLists":"albums"}').collapsedSidebarLists).toEqual([]);
    expect(parseUiSettings('{"sidebarCollapsed":"yes"}').sidebarCollapsed).toBe(false);
  });

  describe('level and PIN', () => {
    const pin = createPin('2580', 'abcdefabcdefabcdefabcdefabcdefab');

    it('reads a stored level', () => {
      expect(parseUiSettings('{"level":"pro"}')).toMatchObject({ level: 'pro', pin: null });
    });

    it('uses Normal for an unknown level and keeps the other settings', () => {
      expect(parseUiSettings('{"level":"expert","skin":"compact"}')).toEqual({ ...DEFAULT_UI_SETTINGS, skin: 'compact' });
    });

    it('reads Child only with a usable PIN', () => {
      expect(parseUiSettings(JSON.stringify({ level: 'child', pin }))).toMatchObject({ level: 'child', pin });
      expect(parseUiSettings('{"level":"child"}')).toMatchObject({ level: 'normal', pin: null });
      expect(parseUiSettings('{"level":"child","pin":"2580"}')).toMatchObject({ level: 'normal', pin: null });
    });

    it('drops a PIN at any other level', () => {
      expect(parseUiSettings(JSON.stringify({ level: 'easy', pin }))).toMatchObject({ level: 'easy', pin: null });
    });

    it('reads an old stored object without the new fields', () => {
      expect(parseUiSettings('{"navBar":"bottom","skin":"glass"}'))
        .toEqual({ ...DEFAULT_UI_SETTINGS, navBar: 'bottom', skin: 'glass' });
    });

    it('cannot keep Child without a PIN in the store', () => {
      useUiSettings.getState().update({ level: 'child', pin: null });
      expect(useUiSettings.getState()).toMatchObject({ level: 'normal', pin: null });
      useUiSettings.getState().update({ level: 'child', pin });
      expect(useUiSettings.getState()).toMatchObject({ level: 'child', pin });
      useUiSettings.getState().update({ level: 'easy' });
      expect(useUiSettings.getState()).toMatchObject({ level: 'easy', pin: null });
    });
  });

  it('reads the slideshow interval and uses 5 seconds for an invalid one', () => {
    expect(parseUiSettings('{"slideshowInterval":10}')).toMatchObject({ slideshowInterval: 10 });
    expect(parseUiSettings('{"slideshowInterval":7}')).toMatchObject({ slideshowInterval: 5 });
    expect(parseUiSettings('{"slideshowInterval":"3"}')).toMatchObject({ slideshowInterval: 5 });
  });

  it('remembers the slideshow and viewer zoom choices', () => {
    const storage = memoryStorage();
    const settings = {
      ...DEFAULT_UI_SETTINGS, slideshowEffect: 'random', slideshowEffectDuration: 2, slideshowShuffle: true,
      slideshowFit: 'fitNoEnlarge', viewerOpenZoom: 'actual',
    } as const satisfies UiSettings;
    expect(saveUiSettings(settings, storage)).toBe(true);
    expect(loadUiSettings(storage)).toEqual(settings);
    expect(parseUiSettings('{"slideshowEffect":"none","slideshowFit":"fill","viewerOpenZoom":"fill"}'))
      .toMatchObject({ slideshowEffect: 'none', slideshowFit: 'fill', viewerOpenZoom: 'fill' });
  });

  it('uses Fade for an unknown stored effect and keeps the other settings', () => {
    expect(parseUiSettings('{"slideshowEffect":"spin","slideshowShuffle":true,"slideshowInterval":10}'))
      .toEqual({ ...DEFAULT_UI_SETTINGS, slideshowShuffle: true, slideshowInterval: 10 });
  });

  it('replaces invalid slideshow and viewer zoom values with their defaults', () => {
    expect(parseUiSettings('{"slideshowEffectDuration":3,"slideshowShuffle":"yes","slideshowFit":"stretch","viewerOpenZoom":"200"}'))
      .toEqual(DEFAULT_UI_SETTINGS);
  });

  it('remembers whether face frames are shown in the viewer', () => {
    const storage = memoryStorage();
    expect(saveUiSettings({ ...DEFAULT_UI_SETTINGS, showFaces: true }, storage)).toBe(true);
    expect(loadUiSettings(storage).showFaces).toBe(true);
    expect(parseUiSettings('{"showFaces":"yes"}').showFaces).toBe(false);
  });

  it('keeps the people list among the collapsed lists', () => {
    expect(parseUiSettings('{"collapsedSidebarLists":["people","nope"]}').collapsedSidebarLists).toEqual(['people']);
  });
});
