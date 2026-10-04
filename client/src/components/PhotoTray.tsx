import React, { useState } from 'react';
import { Alert } from 'react-bootstrap';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Trash2, Download, Printer, LayoutGrid, Film, X, BookPlus, BookMinus, ImageIcon } from 'lucide-react';
import { albumRequest } from '../api/albums.js';
import { AlbumPickerModal } from './AlbumPickerModal.js';

interface PhotoTrayProps {
  onOpenExport: () => void;
  onOpenPrint: () => void;
  onOpenMovie: () => void;
}

export const PhotoTray: React.FC<PhotoTrayProps> = ({ onOpenExport, onOpenPrint, onOpenMovie }) => {
  const { selectedPhotos, clearTray, removePhotoFromTray, setCurrentView, selectedAlbumToken, bumpLibrary } = usePalomaStore();
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selectedPhotos.length === 0) return null;

  const photoIds = selectedPhotos.map((photo) => photo.id);
  const afterChange = () => {
    setError(null);
    clearTray();
    bumpLibrary();
  };

  const removeFromAlbum = async () => {
    try {
      await albumRequest('DELETE', `/api/albums/${selectedAlbumToken}/photos`, { photoIds });
      afterChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const makeCover = async () => {
    try {
      await albumRequest('PATCH', `/api/albums/${selectedAlbumToken}`, { coverPhotoId: photoIds[0] });
      afterChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="photo-tray">
      <div className="d-flex align-items-center gap-3 flex-shrink-0" style={{ maxWidth: '40%' }}>
        <div className="fw-bold fs-5 text-warning d-flex align-items-center gap-2">
          <span>🖼️ Обрано:</span>
          <span className="badge bg-warning text-dark fs-5">{selectedPhotos.length}</span>
        </div>

        <div className="photo-tray-thumbnails">
          {selectedPhotos.map((photo) => (
            <div key={photo.id} className="position-relative d-inline-block">
              <img src={photo.thumbnailUrl} alt={photo.filename} className="photo-tray-thumb" />
              <button
                className="position-absolute top-0 end-0 bg-danger text-white border-0 rounded-circle d-flex align-items-center justify-content-center p-0"
                style={{ width: '18px', height: '18px', transform: 'translate(30%, -30%)' }}
                onClick={() => removePhotoFromTray(photo.id)}
                title="Видалити з буфера"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="position-absolute bottom-100 start-0 end-0 m-2" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="photo-tray-actions ms-3">
        <button className="btn btn-light btn-lg-custom" onClick={() => setShowPicker(true)}>
          <BookPlus size={20} />
          <span>До альбому</span>
        </button>

        {selectedAlbumToken !== null && (
          <button className="btn btn-outline-light btn-lg-custom" onClick={removeFromAlbum}>
            <BookMinus size={20} />
            <span>Прибрати з альбому</span>
          </button>
        )}

        {selectedAlbumToken !== null && selectedPhotos.length === 1 && (
          <button className="btn btn-outline-light btn-lg-custom" onClick={makeCover}>
            <ImageIcon size={20} />
            <span>Зробити обкладинкою</span>
          </button>
        )}

        <button className="btn btn-outline-light btn-lg-custom" onClick={clearTray}>
          <Trash2 size={20} />
          <span>Очистити</span>
        </button>

        <button className="btn btn-primary btn-lg-custom" onClick={onOpenExport}>
          <Download size={20} />
          <span>Експорт</span>
        </button>

        <button className="btn btn-info btn-lg-custom text-white" onClick={onOpenPrint}>
          <Printer size={20} />
          <span>Друк</span>
        </button>

        <button
          className="btn btn-success btn-lg-custom"
          onClick={() => setCurrentView('collage')}
        >
          <LayoutGrid size={20} />
          <span>Колаж</span>
        </button>

        <button className="btn btn-warning btn-lg-custom text-dark" onClick={onOpenMovie}>
          <Film size={20} />
          <span>Відео</span>
        </button>
      </div>

      <AlbumPickerModal show={showPicker} photoIds={photoIds} onHide={() => setShowPicker(false)} onDone={afterChange} />
    </div>
  );
};
