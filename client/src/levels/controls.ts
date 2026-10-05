import type { AppView } from '../store/usePalomaStore.js';
import type { SidebarListId } from '../settings/uiSettings.js';
import { useUiSettings } from '../settings/uiSettings.js';
import { atLeast, type Level } from './levels.js';

/** Tray actions; kept here, not imported from the tray, so this table has no UI dependencies. */
type TrayControl =
  | 'addToAlbum' | 'removeFromAlbum' | 'makeCover' | 'removeLocation' | 'clear' | 'export' | 'print' | 'collage' | 'movie';

/** Every UI control whose availability depends on the level. */
export type ControlId =
  | `view.${AppView}`
  | `sidebar.${SidebarListId}`
  | `tray.${TrayControl}`
  | 'photo.open' | 'photo.select' | 'photo.star'
  | 'viewer.navigate' | 'viewer.zoom' | 'viewer.editBar'
  | 'search' | 'languageSwitcher' | 'slideshow'
  | 'album.editProperties' | 'album.delete'
  | 'map.placePhotos' | 'map.removeLocation';

/**
 * The lowest level at which each control is shown. A control that can change anything is never `child`.
 * Every control a skin or view offers must be listed here; see docs/complexity-levels.md.
 */
export const CONTROL_LEVELS: Record<ControlId, Level> = {
  'view.library': 'child',
  'view.settings': 'child',
  'sidebar.albums': 'child',
  'photo.open': 'child',
  'viewer.navigate': 'child',
  'viewer.zoom': 'child',
  slideshow: 'child',

  'sidebar.shortcuts': 'easy',
  'sidebar.folders': 'easy',
  search: 'easy',
  'photo.select': 'easy',
  'photo.star': 'easy',
  'tray.addToAlbum': 'easy',
  'tray.removeFromAlbum': 'easy',
  'tray.makeCover': 'easy',
  'tray.clear': 'easy',
  'tray.export': 'easy',
  'tray.print': 'easy',
  languageSwitcher: 'easy',
  'viewer.editBar': 'easy',

  'view.people': 'normal',
  'view.map': 'normal',
  'view.collage': 'normal',
  'view.plugins': 'normal',
  'tray.removeLocation': 'normal',
  'tray.collage': 'normal',
  'tray.movie': 'normal',
  'album.editProperties': 'normal',
  'album.delete': 'normal',
  'map.placePhotos': 'normal',
  'map.removeLocation': 'normal',
};

/** Whether the control is shown at the level. */
export const allows = (level: Level, control: ControlId): boolean => atLeast(level, CONTROL_LEVELS[control]);

/** The active level. */
export const useLevel = (): Level => useUiSettings((state) => state.level);

/** Whether the control is shown at the active level. */
export const useAllows = (control: ControlId): boolean => allows(useLevel(), control);
