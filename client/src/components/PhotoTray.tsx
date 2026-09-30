import React from 'react';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { Trash2, Download, Printer, LayoutGrid, Film, X } from 'lucide-react';

interface PhotoTrayProps {
  onOpenExport: () => void;
  onOpenPrint: () => void;
  onOpenMovie: () => void;
}

export const PhotoTray: React.FC<PhotoTrayProps> = ({ onOpenExport, onOpenPrint, onOpenMovie }) => {
  const { selectedPhotos, clearTray, removePhotoFromTray, setCurrentView } = usePalomaStore();

  if (selectedPhotos.length === 0) return null;

  return (
    <div className="photo-tray">
      <div className="d-flex align-items-center gap-3">
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

      <div className="d-flex align-items-center gap-2">
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
    </div>
  );
};
