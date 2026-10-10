import { useTranslation } from 'react-i18next';
import { Info, MapPin, Pencil, Presentation, ScanFace, Trash2, type LucideIcon } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';
import { fetchSelectionPhotos } from '../api/library.js';
import { currentLanguage } from '../i18n/index.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { allows, useLevel } from '../levels/controls.js';
import type { Level } from '../levels/levels.js';
import { useFaceDetection } from '../faces/detectionRunner.js';
import { enterFullscreen, leaveFullscreen } from '../components/slideshow/Slideshow.js';
import { slideshowStart } from '../components/slideshow/slideshowStart.js';
import { entrySelection, openEntry, type LibraryEntry } from './entries.js';

export type EntryMenuItemId = 'slideshow' | 'findFaces' | 'map' | 'info' | 'properties' | 'delete';

/**
 * The items of an entry's menu at a level, in order: the actions of the entry's grid header (Slideshow, Find
 * faces, and for an album Edit properties and Delete) at their own levels, then Map and Information.
 */
export function entryMenuItemIds(entry: LibraryEntry, level: Level, detecting = false): EntryMenuItemId[] {
  const ids: EntryMenuItemId[] = [];
  if (allows(level, 'slideshow')) ids.push('slideshow');
  // Like the header's button, not offered while a run exists
  if (allows(level, 'faces.detect') && !detecting) ids.push('findFaces');
  if (allows(level, 'view.map')) ids.push('map');
  if (allows(level, 'entry.info')) ids.push('info');
  if (entry.kind === 'album' && allows(level, 'album.editProperties')) ids.push('properties');
  if (entry.kind === 'album' && allows(level, 'album.delete')) ids.push('delete');
  return ids;
}

/** The photos of the entry, as its grid would show them. */
const entryPhotos = (entry: LibraryEntry): Promise<Photo[]> => fetchSelectionPhotos(entrySelection(entry), currentLanguage());

/**
 * Plays the entry's photos as a slideshow, keeping what the library shows. Full screen is asked for at once,
 * while the click still allows it, and left again when there is nothing to play.
 */
export async function playEntry(entry: LibraryEntry): Promise<void> {
  enterFullscreen();
  try {
    const photos = await entryPhotos(entry);
    if (photos.length === 0) {
      leaveFullscreen();
      return;
    }
    const { startSlideshow, selectedPhotos } = usePalomaStore.getState();
    startSlideshow(photos, slideshowStart(photos, selectedPhotos));
  } catch (err) {
    leaveFullscreen();
    console.error('Failed to fetch photos for the slideshow:', err);
  }
}

/** Finds the faces on the entry's photos, as the header's Find faces does. */
export async function detectEntryFaces(entry: LibraryEntry): Promise<void> {
  try {
    const photos = await entryPhotos(entry);
    if (photos.length > 0) await useFaceDetection.getState().start(photos);
  } catch (err) {
    console.error('Failed to fetch photos for face detection:', err);
  }
}

/** Opens the entry and shows its photos on the map. */
export function mapEntry(entry: LibraryEntry): void {
  openEntry(entry);
  usePalomaStore.getState().setCurrentView('map');
}

export interface EntryMenuItem {
  id: EntryMenuItemId;
  label: string;
  icon: LucideIcon;
  /** A destructive action, shown as such */
  danger?: boolean;
  run: () => void;
}

/** What the menu's dialogs open with; the menu button owns them. */
export interface EntryMenuDialogs {
  showInfo: () => void;
  showAlbumProperties: () => void;
  confirmAlbumDelete: () => void;
}

/** The entry menu's items at the active level, with labels in the active language; the same in every skin. */
export function useEntryMenuItems(entry: LibraryEntry, dialogs: EntryMenuDialogs): EntryMenuItem[] {
  const { t } = useTranslation();
  const level = useLevel();
  const detecting = useFaceDetection((state) => state.progress !== null);
  const items: Record<EntryMenuItemId, Omit<EntryMenuItem, 'id'>> = {
    slideshow: { label: t('slideshow.start'), icon: Presentation, run: () => { void playEntry(entry); } },
    findFaces: { label: t('faces.detect'), icon: ScanFace, run: () => { void detectEntryFaces(entry); } },
    map: { label: t('entryMenu.map'), icon: MapPin, run: () => mapEntry(entry) },
    info: { label: t('entryMenu.info'), icon: Info, run: dialogs.showInfo },
    properties: { label: t('album.properties'), icon: Pencil, run: dialogs.showAlbumProperties },
    delete: { label: t('album.delete'), icon: Trash2, danger: true, run: dialogs.confirmAlbumDelete },
  };
  return entryMenuItemIds(entry, level, detecting).map((id) => ({ id, ...items[id] }));
}
