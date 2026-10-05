import React from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { MapPin, X } from 'lucide-react';
import { describeError } from '../../../api/http.js';
import { PHOTO_DRAG_TYPE, useTray } from '../../../shell/useTray.js';
import type { TrayHandlers } from '../types.js';

/** Classic photo tray: a bar along the bottom with the selected photos and large labelled actions. */
export const ClassicTray: React.FC<TrayHandlers> = (handlers) => {
  const { t } = useTranslation();
  const tray = useTray(handlers);
  if (tray.photos.length === 0) return null;

  return (
    <div className="photo-tray">
      <div className="d-flex align-items-center gap-3 flex-shrink-0" style={{ maxWidth: '40%' }}>
        <div className="fw-bold fs-5 photo-tray-count d-flex align-items-center gap-2">
          <span>{t('tray.selected')}</span>
          <span className="badge bg-warning fs-5">{t('common.photos', { count: tray.photos.length })}</span>
        </div>

        {tray.singlePlace !== null && (
          <div className="d-flex align-items-center gap-1 fs-6 text-truncate" title={tray.singlePlace} style={{ maxWidth: '14rem' }}>
            <MapPin size={16} className="flex-shrink-0" />
            <span dir="auto" className="text-truncate">{tray.singlePlace}</span>
          </div>
        )}

        <div className="photo-tray-thumbnails">
          {tray.photos.map((photo) => (
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
                type="button"
                className="photo-tray-remove position-absolute top-0 end-0 border-0 rounded-circle d-flex align-items-center justify-content-center p-0"
                onClick={() => tray.removePhoto(photo.id)}
                title={t('tray.removeFromTray')}
                aria-label={t('tray.removeFromTray')}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {tray.error != null && (
        <Alert variant="danger" className="position-absolute bottom-100 start-0 end-0 m-2" dismissible onClose={tray.clearError}>
          {describeError(tray.error, t)}
        </Alert>
      )}

      <div className="photo-tray-actions ms-3">
        {tray.actions.map(({ id, label, icon: Icon, variant, run }) => (
          <button key={id} type="button" className={`btn btn-${variant} btn-lg-custom`} onClick={run} data-action={id}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tray.dialogs}
    </div>
  );
};
