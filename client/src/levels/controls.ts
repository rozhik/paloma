import type { AppView } from '../store/usePalomaStore.js';
import type { SidebarListId } from '../settings/uiSettings.js';
import { useUiSettings } from '../settings/uiSettings.js';
import { atLeast, type Level } from './levels.js';

/** Tray actions; kept here, not imported from the tray, so this table has no UI dependencies. */
type TrayControl =
  | 'addToAlbum' | 'addTags' | 'removeTag' | 'removeFromAlbum' | 'makeCover' | 'removeLocation' | 'clear' | 'export' | 'print'
  | 'collage' | 'movie';

/** Every UI control whose availability depends on the level. */
export type ControlId =
  | `view.${AppView}`
  | `sidebar.${SidebarListId}`
  | `tray.${TrayControl}`
  | 'photo.open' | 'photo.select' | 'photo.star'
  | 'viewer.navigate' | 'viewer.zoom' | 'viewer.editBar' | 'viewer.info' | 'viewer.faces' | 'viewer.faces.assign'
  | 'info.exif' | 'info.json' | 'info.people' | 'info.people.edit'
  | 'people.choose' | 'people.edit' | 'faces.detect' | 'faces.similar' | 'faces.unrecognized'
  | 'search' | 'slideshow'
  | 'settings.plugins'
  | 'entry.menu' | 'entry.info'
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
  // The menu of a sidebar entry; it offers only the items of the active level
  'entry.menu': 'child',

  'sidebar.shortcuts': 'easy',
  // Today's memories and opening one; a memory cannot be changed
  'sidebar.memories': 'easy',
  'sidebar.folders': 'easy',
  'sidebar.tags': 'easy',
  search: 'easy',
  'photo.select': 'easy',
  'photo.star': 'easy',
  'tray.addToAlbum': 'easy',
  'tray.addTags': 'easy',
  'tray.removeTag': 'easy',
  'tray.removeFromAlbum': 'easy',
  'tray.makeCover': 'easy',
  'tray.clear': 'easy',
  'tray.export': 'easy',
  'tray.print': 'easy',
  'viewer.editBar': 'easy',
  // An entry's Information dialog, with its statistics and links
  'entry.info': 'easy',
  // The Info panel with editing the description and tags
  'viewer.info': 'easy',
  // Seeing people: the sidebar list, a person's photos, the people on a photo and face frames in the viewer
  'sidebar.people': 'easy',
  'people.choose': 'easy',
  'info.people': 'easy',
  'viewer.faces': 'easy',

  'view.people': 'normal',
  'view.map': 'normal',
  'view.collage': 'normal',
  // The Plugins section of Settings
  'settings.plugins': 'normal',
  'tray.removeLocation': 'normal',
  'tray.collage': 'normal',
  'tray.movie': 'normal',
  'album.editProperties': 'normal',
  'album.delete': 'normal',
  'map.placePhotos': 'normal',
  'map.removeLocation': 'normal',
  // Changing people: profiles, marks on photos, face detection and similar faces
  'people.edit': 'normal',
  'info.people.edit': 'normal',
  'viewer.faces.assign': 'normal',
  'faces.detect': 'normal',
  'faces.similar': 'normal',
  // The Unrecognized entry of the People list and naming the faces there
  'faces.unrecognized': 'normal',

  'info.exif': 'pro',

  'info.json': 'developer',
};

/** Whether the control is shown at the level. */
export const allows = (level: Level, control: ControlId): boolean => atLeast(level, CONTROL_LEVELS[control]);

/** The active level. */
export const useLevel = (): Level => useUiSettings((state) => state.level);

/** Whether the control is shown at the active level. */
export const useAllows = (control: ControlId): boolean => allows(useLevel(), control);
