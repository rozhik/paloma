import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScanFace } from 'lucide-react';
import type { Photo } from '../../../shared/types.js';
import { useAllows } from '../levels/controls.js';
import { useFaceDetection } from './detectionRunner.js';

/** Starts face detection for every photo the grid shows; not offered while a run exists or the grid is empty. */
export const FaceDetectionButton: React.FC<{ photos: Photo[] }> = ({ photos }) => {
  const { t } = useTranslation();
  const allowed = useAllows('faces.detect');
  const running = useFaceDetection((state) => state.progress !== null);
  const start = useFaceDetection((state) => state.start);
  if (!allowed || running || photos.length === 0) return null;
  return (
    <button type="button" className="btn btn-outline-primary btn-lg-custom" onClick={() => start(photos)}>
      <ScanFace size={20} aria-hidden="true" />
      <span>{t('faces.detect')}</span>
    </button>
  );
};
