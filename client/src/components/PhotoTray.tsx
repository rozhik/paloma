import React, { useState } from 'react';
import { Alert } from 'react-bootstrap';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useTranslation } from 'react-i18next';
import { Trash2, Download, Printer, LayoutGrid, Film, X, BookPlus, BookMinus, ImageIcon, MapPin, MapPinOff } from 'lucide-react';
import { apiRequest, describeError } from '../api/http.js';
import { setPhotosLocation } from '../api/geo.js';
import { AlbumPickerModal } from './AlbumPickerModal.js';
import { ConfirmModal } from './ConfirmModal.js';
import { usePlaceLabel } from './placeLabel.js';

/** Data type of a photo id dragged from the tray, e.g. onto the map. */
export const PHOTO_DRAG_TYPE = 'application/x-paloma-photo';

interface PhotoTrayProps {
  onOpenExport: () => void;
  onOpenPrint: () => void;
  onOpenMovie: () => void;
}

export const PhotoTray: React.FC<PhotoTrayProps> = ({ onOpenExport, onOpenPrint, onOpenMovie }) => {
  const { selectedPhotos, clearTray, removePhotoFromTray, setCurrentView, selectedAlbumToken, bumpLibrary } = usePalomaStore();
  const [showPicker, setShowPicker] = useState(false);
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
  const [confirmRemoveLocation, setConfirmRemoveLocation] = useState(false);
  const placeLabel = usePlaceLabel();

  if (selectedPhotos.length === 0) return null;
  const geotagged = selectedPhotos.filter((photo) => photo.latitude !== null);
  const singlePlace = selectedPhotos.length === 1 ? placeLabel(selectedPhotos[0]) : null;

  const photoIds = selectedPhotos.map((photo) => photo.id);
  const afterChange = () => {
    setError(null);
    clearTray();
    bumpLibrary();
  };

  const removeFromAlbum = async () => {
    try {
      await apiRequest('DELETE', `/api/albums/${selectedAlbumToken}/photos`, { photoIds });
      afterChange();
    } catch (err) {
      setError(err);
    }
  };

  const removeLocation = async () => {
    setConfirmRemoveLocation(false);
    try {
      await setPhotosLocation(geotagged.map((photo) => photo.id), null);
      afterChange();
    } catch (err) {
      setError(err);
    }
  };

  const makeCover = async () => {
    try {
      await apiRequest('PATCH', `/api/albums/${selectedAlbumToken}`, { coverPhotoId: photoIds[0] });
      afterChange();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="photo-tray">
      <div className="d-flex align-items-center gap-3 flex-shrink-0" style={{ maxWidth: '40%' }}>
        <div className="fw-bold fs-5 text-warning d-flex align-items-center gap-2">
          <span>{t('tray.selected')}</span>
          <span className="badge bg-warning text-dark fs-5">{t('common.photos', { count: selectedPhotos.length })}</span>
        </div>

        {singlePlace !== null && (
          <div className="d-flex align-items-center gap-1 text-light fs-6 text-truncate" title={singlePlace} style={{ maxWidth: '14rem' }}>
            <MapPin size={16} className="text-danger flex-shrink-0" />
            <span dir="auto" className="text-truncate">{singlePlace}</span>
          </div>
        )}

        <div className="photo-tray-thumbnails">
          {selectedPhotos.map((photo) => (
            <div key={photo.id} className="position-relative d-inline-block">
              <img
                src={photo.thumbnailUrl}
                alt={photo.filename}
                className="photo-tray-thumb"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(PHOTO_DRAG_TYPE, String(photo.id));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              />
              <button
                className="photo-tray-remove position-absolute top-0 end-0 bg-danger text-white border-0 rounded-circle d-flex align-items-center justify-content-center p-0"
                onClick={() => removePhotoFromTray(photo.id)}
                title={t('tray.removeFromTray')}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error != null && (
        <Alert variant="danger" className="position-absolute bottom-100 start-0 end-0 m-2" dismissible onClose={() => setError(null)}>
          {describeError(error, t)}
        </Alert>
      )}

      <div className="photo-tray-actions ms-3">
        <button className="btn btn-light btn-lg-custom" onClick={() => setShowPicker(true)}>
          <BookPlus size={20} />
          <span>{t('tray.addToAlbum')}</span>
        </button>

        {selectedAlbumToken !== null && (
          <button className="btn btn-outline-light btn-lg-custom" onClick={removeFromAlbum}>
            <BookMinus size={20} />
            <span>{t('tray.removeFromAlbum')}</span>
          </button>
        )}

        {selectedAlbumToken !== null && selectedPhotos.length === 1 && (
          <button className="btn btn-outline-light btn-lg-custom" onClick={makeCover}>
            <ImageIcon size={20} />
            <span>{t('tray.makeCover')}</span>
          </button>
        )}

        {geotagged.length > 0 && (
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => setConfirmRemoveLocation(true)}>
            <MapPinOff size={20} />
            <span>{t('geo.removeLocation')}</span>
          </button>
        )}

        <button className="btn btn-outline-light btn-lg-custom" onClick={clearTray}>
          <Trash2 size={20} />
          <span>{t('tray.clear')}</span>
        </button>

        <button className="btn btn-primary btn-lg-custom" onClick={onOpenExport}>
          <Download size={20} />
          <span>{t('tray.export')}</span>
        </button>

        <button className="btn btn-info btn-lg-custom text-white" onClick={onOpenPrint}>
          <Printer size={20} />
          <span>{t('tray.print')}</span>
        </button>

        <button
          className="btn btn-success btn-lg-custom"
          onClick={() => setCurrentView('collage')}
        >
          <LayoutGrid size={20} />
          <span>{t('tray.collage')}</span>
        </button>

        <button className="btn btn-warning btn-lg-custom text-dark" onClick={onOpenMovie}>
          <Film size={20} />
          <span>{t('tray.movie')}</span>
        </button>
      </div>

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
    </div>
  );
};
