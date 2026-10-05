import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UI_SETTINGS, UI_SETTINGS_STORAGE_KEY, loadUiSettings, parseUiSettings, saveUiSettings,
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
  it('defaults to the navigation bar on top and the edit bar on the left', () => {
    expect(DEFAULT_UI_SETTINGS).toEqual({ navBar: 'top', editBar: 'left' });
    expect(loadUiSettings(memoryStorage())).toEqual(DEFAULT_UI_SETTINGS);
    expect(loadUiSettings(null)).toEqual(DEFAULT_UI_SETTINGS);
  });

  it('remembers settings and reads them back', () => {
    const storage = memoryStorage();
    expect(saveUiSettings({ navBar: 'bottom', editBar: 'right' }, storage)).toBe(true);
    expect(JSON.parse(storage.items.get(UI_SETTINGS_STORAGE_KEY)!)).toEqual({ navBar: 'bottom', editBar: 'right' });
    expect(loadUiSettings(storage)).toEqual({ navBar: 'bottom', editBar: 'right' });
  });

  it('accepts both bars on the same edge', () => {
    expect(parseUiSettings('{"navBar":"bottom","editBar":"bottom"}')).toEqual({ navBar: 'bottom', editBar: 'bottom' });
  });

  it('replaces only the invalid value with its default', () => {
    expect(parseUiSettings('{"navBar":"middle","editBar":"right"}')).toEqual({ navBar: 'top', editBar: 'right' });
    expect(parseUiSettings('{"editBar":42}')).toEqual(DEFAULT_UI_SETTINGS);
  });

  it('uses the defaults for malformed or non-object JSON', () => {
    expect(parseUiSettings('{broken')).toEqual(DEFAULT_UI_SETTINGS);
    expect(parseUiSettings('"top"')).toEqual(DEFAULT_UI_SETTINGS);
    expect(parseUiSettings('null')).toEqual(DEFAULT_UI_SETTINGS);
  });

  it('keeps working when the browser cannot store anything', () => {
    expect(loadUiSettings(throwing)).toEqual(DEFAULT_UI_SETTINGS);
    expect(saveUiSettings({ navBar: 'left', editBar: 'top' }, throwing)).toBe(false);
  });
});
