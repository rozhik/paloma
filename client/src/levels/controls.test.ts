import { describe, it, expect } from 'vitest';
import { CONTROL_LEVELS, allows, type ControlId } from './controls.js';
import { LEVELS } from './levels.js';
import { NAV_ITEMS } from '../shell/navigation.js';
import { TRAY_ACTION_IDS } from '../shell/useTray.js';
import { SIDEBAR_LISTS } from '../settings/uiSettings.js';

describe('control levels', () => {
  it('give every navigation item, tray action and sidebar list a level', () => {
    const ids = [
      ...NAV_ITEMS.map(({ view }) => `view.${view}`),
      ...TRAY_ACTION_IDS.map((id) => `tray.${id}`),
      ...SIDEBAR_LISTS.map((id) => `sidebar.${id}`),
    ];
    for (const id of ids) expect(LEVELS).toContain(CONTROL_LEVELS[id as ControlId]);
  });

  it('match the documented table', () => {
    expect(CONTROL_LEVELS['tray.export']).toBe('easy');
    expect(CONTROL_LEVELS['view.map']).toBe('normal');
    expect(CONTROL_LEVELS.slideshow).toBe('child');
    expect(CONTROL_LEVELS['viewer.editBar']).toBe('easy');
    expect(CONTROL_LEVELS['album.delete']).toBe('normal');
  });

  it('show Child only the library, albums, viewing, slideshow and settings', () => {
    const child = (Object.keys(CONTROL_LEVELS) as ControlId[]).filter((id) => allows('child', id)).sort();
    expect(child).toEqual([
      'photo.open', 'sidebar.albums', 'slideshow', 'view.library', 'view.settings', 'viewer.navigate', 'viewer.zoom',
    ]);
  });

  it('show Developer everything', () => {
    for (const id of Object.keys(CONTROL_LEVELS) as ControlId[]) expect(allows('developer', id)).toBe(true);
  });
});
