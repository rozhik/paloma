import type { Permission } from '../../../shared/types.js';
import type { AppView } from '../store/usePalomaStore.js';
import { grantedPermissions, useAuthStore } from '../auth/authStore.js';
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
  | 'info.exif' | 'info.json' | 'info.edit' | 'info.people' | 'info.people.edit'
  | 'people.choose' | 'people.edit' | 'faces.detect' | 'faces.similar' | 'faces.unrecognized'
  | 'search' | 'slideshow'
  | 'user.menu' | 'user.logout' | 'account.tokens'
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
  // The avatar button and its menu, with the user's name and, when users are on, Log out
  'user.menu': 'child',
  'user.logout': 'child',

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
  // Profile, password and logged-in devices, when users are on
  'view.account': 'easy',
  'info.edit': 'easy',
  // Seeing people: the sidebar list, a person's photos, the people on a photo and face frames in the viewer
  'sidebar.people': 'easy',
  'people.choose': 'easy',
  'info.people': 'easy',
  'viewer.faces': 'easy',

  'view.people': 'normal',
  'view.map': 'normal',
  'view.collage': 'normal',
  // Users, roles, sessions and tokens, when users are on
  'view.admin': 'normal',
  // Plugins and the server's configuration
  'view.server': 'normal',
  // The tokens list of the Account view
  'account.tokens': 'normal',
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

/**
 * The permission a control needs when users are on, beyond its level. Controls without an entry need only that
 * the user can see the library. A control that changes anything must be listed; see docs/users-and-auth.md.
 */
export const CONTROL_PERMISSIONS: Partial<Record<ControlId, Permission>> = {
  'view.admin': 'users.manage',
  'view.server': 'plugins.manage',
  'account.tokens': 'account.tokens',
  'photo.star': 'photos.edit',
  'tray.addTags': 'photos.edit',
  'tray.removeTag': 'photos.edit',
  'tray.removeLocation': 'photos.edit',
  'viewer.editBar': 'photos.edit',
  'info.edit': 'photos.edit',
  'map.placePhotos': 'photos.edit',
  'map.removeLocation': 'photos.edit',
  'tray.addToAlbum': 'albums.manage',
  'tray.removeFromAlbum': 'albums.manage',
  'tray.makeCover': 'albums.manage',
  'album.editProperties': 'albums.manage',
  'album.delete': 'albums.manage',
  'people.edit': 'people.manage',
  'info.people.edit': 'people.manage',
  'viewer.faces.assign': 'people.manage',
  'faces.detect': 'people.manage',
  'faces.similar': 'people.manage',
  'faces.unrecognized': 'people.manage',
  'tray.export': 'export',
  'tray.movie': 'export',
  'tray.collage': 'export',
};

/** Controls shown only when users are on. */
const AUTH_ONLY: readonly ControlId[] = ['view.admin', 'view.account', 'account.tokens', 'user.logout'];

/** Whether the current user's permissions allow the control (always, with users off, except auth-only controls). */
export function permits(control: ControlId): boolean {
  const granted = grantedPermissions();
  if (granted === null) return !AUTH_ONLY.includes(control);
  const permission = CONTROL_PERMISSIONS[control];
  return permission === undefined || granted.has(permission);
}

/** Whether the control is shown at the level, for the current user. */
export const allows = (level: Level, control: ControlId): boolean => atLeast(level, CONTROL_LEVELS[control]) && permits(control);

/**
 * The active level. Components that check controls get it from here, so they also show again when the
 * current user's permissions change.
 */
export const useLevel = (): Level => {
  useAuthStore((state) => state.me);
  return useUiSettings((state) => state.level);
};

/** Whether the control is shown at the active level, for the current user. */
export const useAllows = (control: ControlId): boolean => allows(useLevel(), control);
