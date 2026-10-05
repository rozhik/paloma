import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookMinus, BookPlus, Download, Film, ImageIcon, LayoutGrid, MapPinOff, Printer, Trash2, type LucideIcon } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';
import { apiRequest } from '../api/http.js';
import { setPhotosLocation } from '../api/geo.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { AlbumPickerModal } from '../components/AlbumPickerModal.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { usePlaceLabel } from '../components/placeLabel.js';
import type { TrayHandlers } from '../appearance/skins/types.js';
import { allows, useLevel } from '../levels/controls.js';
import type { Level } from '../levels/levels.js';

/** Data type of a photo id dragged from the tray, e.g. onto the map. */
export const PHOTO_DRAG_TYPE = 'application/x-paloma-photo';

/** Every action the tray can offer, in order. Every skin's tray shows those that apply. */
export const TRAY_ACTION_IDS = [
  'addToAlbum', 'removeFromAlbum', 'makeCover', 'removeLocation', 'clear', 'export', 'print', 'collage', 'movie',
] as const;
export type TrayActionId = typeof TRAY_ACTION_IDS[number];

/** The tray actions shown at a level, when they apply. */
export const trayActionsFor = (level: Level): TrayActionId[] => TRAY_ACTION_IDS.filter((id) => allows(level, `tray.${id}`));

export interface TrayAction {
  id: TrayActionId;
  label: string;
  icon: LucideIcon;
  /** How Classic colors it; other skins may ignore it */
  variant: 'primary' | 'light' | 'outline-light' | 'info' | 'success' | 'warning';
  run: () => void;
}

export interface Tray {
  photos: Photo[];
  /** Where the only selected photo was taken, if it is one photo with a place */
  singlePlace: string | null;
  actions: TrayAction[];
  removePhoto: (photoId: number) => void;
  error: unknown;
  clearError: () => void;
  /** The tray's dialogs; render them anywhere in the tray */
  dialogs: React.ReactNode;
}

/** The photo tray's state and actions; the same for every skin. */
export function useTray(handlers: TrayHandlers): Tray {
  const { selectedPhotos, clearTray, removePhotoFromTray, setCurrentView, selectedAlbumToken, bumpLibrary } = usePalomaStore();
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmRemoveLocation, setConfirmRemoveLocation] = useState(false);
  const placeLabel = usePlaceLabel();
  const shown = trayActionsFor(useLevel());

  const geotagged = selectedPhotos.filter((photo) => photo.latitude !== null);
  const photoIds = selectedPhotos.map((photo) => photo.id);
  const inAlbum = selectedAlbumToken !== null;

  const afterChange = () => {
    setError(null);
    clearTray();
    bumpLibrary();
  };
  const attempt = (work: () => Promise<unknown>) => async () => {
    try {
      await work();
      afterChange();
    } catch (err) {
      setError(err);
    }
  };

  const removeLocation = async () => {
    setConfirmRemoveLocation(false);
    await attempt(() => setPhotosLocation(geotagged.map((photo) => photo.id), null))();
  };

  const all: (TrayAction & { when: boolean })[] = [
    { id: 'addToAlbum', label: t('tray.addToAlbum'), icon: BookPlus, variant: 'light', when: true, run: () => setShowPicker(true) },
    {
      id: 'removeFromAlbum', label: t('tray.removeFromAlbum'), icon: BookMinus, variant: 'outline-light', when: inAlbum,
      run: attempt(() => apiRequest('DELETE', `/api/albums/${selectedAlbumToken}/photos`, { photoIds })),
    },
    {
      id: 'makeCover', label: t('tray.makeCover'), icon: ImageIcon, variant: 'outline-light', when: inAlbum && selectedPhotos.length === 1,
      run: attempt(() => apiRequest('PATCH', `/api/albums/${selectedAlbumToken}`, { coverPhotoId: photoIds[0] })),
    },
    {
      id: 'removeLocation', label: t('geo.removeLocation'), icon: MapPinOff, variant: 'outline-light', when: geotagged.length > 0,
      run: () => setConfirmRemoveLocation(true),
    },
    { id: 'clear', label: t('tray.clear'), icon: Trash2, variant: 'outline-light', when: true, run: clearTray },
    { id: 'export', label: t('tray.export'), icon: Download, variant: 'primary', when: true, run: handlers.onOpenExport },
    { id: 'print', label: t('tray.print'), icon: Printer, variant: 'info', when: true, run: handlers.onOpenPrint },
    { id: 'collage', label: t('tray.collage'), icon: LayoutGrid, variant: 'success', when: true, run: () => setCurrentView('collage') },
    { id: 'movie', label: t('tray.movie'), icon: Film, variant: 'warning', when: true, run: handlers.onOpenMovie },
  ];

  return {
    photos: selectedPhotos,
    singlePlace: selectedPhotos.length === 1 ? placeLabel(selectedPhotos[0]) : null,
    actions: all.filter((action) => action.when && shown.includes(action.id)).map(({ when, ...action }) => action),
    removePhoto: removePhotoFromTray,
    error,
    clearError: () => setError(null),
    dialogs: (
      <>
        <AlbumPickerModal show={showPicker} photoIds={photoIds} onHide={() => setShowPicker(false)} onDone={afterChange} />
        <ConfirmModal
          show={confirmRemoveLocation}
          title={t('geo.removeLocationTitle')}
          body={t('geo.removeLocationBody', { count: geotagged.length })}
          confirmLabel={t('geo.removeLocation')}
          variant="danger"
          onConfirm={removeLocation}
          onCancel={() => setConfirmRemoveLocation(false)}
        />
      </>
    ),
  };
}
