import React from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { describeError } from '../../api/http.js';
import { useSkin } from '../../appearance/runtime.js';
import { usePalomaStore, type ViewerState } from '../../store/usePalomaStore.js';
import { CropOverlay, StraightenGrid } from '../CropOverlay.js';
import { usePhotoViewer } from './usePhotoViewer.js';
import { ZoomStage } from './ZoomStage.js';

/** The photo viewer, shown over the library while a photo is open. */
export const PhotoViewer: React.FC = () => {
  const viewer = usePalomaStore((state) => state.viewer);
  return viewer ? <ViewerScreen viewer={viewer} /> : null;
};

/** The photo itself is the same in every skin; the bars and panel around it are the skin's. */
const ViewerScreen: React.FC<{ viewer: ViewerState }> = ({ viewer }) => {
  const { t } = useTranslation();
  const { components: { ViewerChrome } } = useSkin();
  const v = usePhotoViewer(viewer);
  const { photo, frame, preview, edits } = v;

  return (
    <div
      ref={v.root}
      className="photo-viewer"
      style={{ '--viewer-bar-size': `${v.barSize}px` } as React.CSSProperties}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={photo.filename}
    >
      <ZoomStage
        url={preview.url}
        placeholder={photo.previewUrl}
        alt={photo.filename}
        full={v.full}
        stage={v.stage}
        zoom={v.zoom}
        onZoom={v.setZoom}
        onStageResize={v.onStageResize}
        locked={!!frame}
      >
        {frame && !preview.loading && (
          <CropOverlay
            rect={frame.rect}
            ratio={v.frameRatio}
            imageAspect={v.imageAspect}
            onChange={(rect) => v.setFrame({ ...frame, rect })}
            label={t('editor.frame.hint')}
          />
        )}
        {v.showGrid && <StraightenGrid />}
      </ZoomStage>

      <ViewerChrome model={v} />

      {(v.saveMessage || v.loadError || preview.error != null) && (
        <div className="viewer-toast">
          {v.saveMessage && (
            <Alert variant="danger" className={`mb-2 fs-5 ${v.blocked ? 'viewer-attention' : ''}`} onAnimationEnd={() => v.setBlocked(false)}>
              <div className="mb-2">{t('editor.saveFailed', { message: v.saveMessage })}</div>
              <div className="d-flex gap-2 flex-wrap">
                <button type="button" className="btn btn-danger btn-lg" onClick={() => { v.setBlocked(false); edits.retry(); }}>{t('editor.retry')}</button>
                <button type="button" className="btn btn-outline-danger btn-lg" onClick={() => { v.setBlocked(false); edits.discard(); }}>{t('editor.discard')}</button>
              </div>
            </Alert>
          )}
          {v.loadError && <Alert variant="danger" className="mb-2 fs-5" onClose={() => v.setLoadError(null)} dismissible>{v.loadError}</Alert>}
          {preview.error != null && <Alert variant="danger" className="mb-0 fs-5">{describeError(preview.error, t)}</Alert>}
        </div>
      )}
    </div>
  );
};
