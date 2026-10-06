import React from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../i18n/format.js';
import { progressShare, useFaceDetection, type DetectionProgress, type DetectionResult } from './detectionRunner.js';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The ring for a run: filled to the share done, with `done / total` inside. Activating it cancels the run. */
export const ProgressRing: React.FC<{ progress: DetectionProgress; onCancel: () => void }> = ({ progress, onCancel }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const share = progressShare(progress);
  const label = progress.cancelling
    ? t('faces.cancelling')
    : t('faces.cancel', { done: progress.done, total: progress.total });
  return (
    <button
      type="button"
      className="face-progress pal-surface"
      aria-label={label}
      title={label}
      disabled={progress.cancelling}
      onClick={onCancel}
    >
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <circle className="face-progress-track" cx="32" cy="32" r={RADIUS} />
        <circle
          className="face-progress-bar"
          cx="32"
          cy="32"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - share)}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="face-progress-count" dir="ltr">{`${formatNumber(progress.done)} / ${formatNumber(progress.total)}`}</span>
    </button>
  );
};

/** The message a finished run leaves. */
export function resultMessage(result: DetectionResult, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (result.error != null) return t('faces.loadFailed', { message: result.error instanceof Error ? result.error.message : String(result.error) });
  if (result.total === 0) return t('faces.nothingToDo');
  const parts = [t('faces.found', { faces: result.faces, photos: result.photos })];
  if (result.cancelled) parts.unshift(t('faces.stopped'));
  if (result.failed > 0) parts.push(t('faces.failed', { failed: result.failed }));
  return parts.join(' ');
}

/**
 * Over the library while face detection runs: the progress ring in the bottom corner, and the result message
 * once the run ends. The grid behind stays usable.
 */
export const FaceDetectionOverlay: React.FC = () => {
  const { t } = useTranslation();
  const { progress, result, cancel, dismissResult } = useFaceDetection();
  if (progress) {
    return (
      <div className="face-progress-dock" aria-live="polite">
        <ProgressRing progress={progress} onCancel={cancel} />
      </div>
    );
  }
  if (!result) return null;
  return (
    <div className="face-progress-dock" aria-live="polite">
      <Alert variant={result.error != null || result.failed > 0 ? 'warning' : 'success'} dismissible onClose={dismissResult} className="mb-0 fs-6 shadow">
        {resultMessage(result, t as never)}
      </Alert>
    </div>
  );
};
