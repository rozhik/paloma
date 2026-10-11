import React, { useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { AiRunInfo } from '../../../shared/types.js';
import { useFormat } from '../i18n/format.js';
import { useAllows } from '../levels/controls.js';
import { progressShare, useFaceDetection } from '../faces/detectionRunner.js';
import { describeError } from '../api/http.js';
import { runMessage, taskName } from './aiText.js';
import { useAiRun, useAiRunPolling } from './useAiRun.js';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The ring for an AI run: filled to the share done, with `done / total` inside. Activating it opens a card with
 * the task's name, the count and Stop.
 */
export const AiRunRing: React.FC<{ run: AiRunInfo; onStop: () => void }> = ({ run, onStop }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const [open, setOpen] = useState(false);
  const share = progressShare(run);
  const label = t('ai.run.progress', { task: taskName({ id: run.taskId, name: run.taskName }, t), done: run.done, total: run.total });
  const cancelling = run.state === 'cancelling';
  return (
    <div className="d-flex align-items-end gap-2">
      {open && (
        <div className="card shadow pal-surface" role="dialog" aria-label={label}>
          <div className="card-body py-2 px-3">
            <p className="mb-2 fw-semibold">{label}</p>
            {cancelling
              ? <p className="mb-0 text-secondary">{t('ai.run.cancelling')}</p>
              : <Button variant="outline-danger" size="sm" onClick={onStop}>{t('ai.run.stop')}</Button>}
          </div>
        </div>
      )}
      <button
        type="button"
        className="face-progress ai-progress pal-surface"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
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
        <span className="face-progress-count" dir="ltr">{`${formatNumber(run.done)} / ${formatNumber(run.total)}`}</span>
      </button>
    </div>
  );
};

/**
 * Over every view for users who may run AI tasks: the ring of the server's AI run, from any browser that started
 * it, and the message when a run this browser watched ends. Stacks above the face detection ring.
 */
export const AiRunOverlay: React.FC = () => {
  const { t } = useTranslation();
  const allowed = useAllows('ai.run');
  useAiRunPolling(allowed);
  const { current, result, error, cancel, dismissResult, dismissError } = useAiRun();
  const faces = useFaceDetection((state) => state.progress !== null || state.result !== null);
  if (!allowed || (!current && !result && !error)) return null;
  const stop = () => { cancel().catch((err) => useAiRun.setState({ error: err })); };
  return (
    <div className={`face-progress-dock${faces ? ' ai-progress-dock-stacked' : ''}`} aria-live="polite">
      {error != null && <Alert variant="danger" dismissible onClose={dismissError} className="mb-2 fs-6 shadow">{describeError(error, t)}</Alert>}
      {current ? <AiRunRing run={current} onStop={stop} /> : result && (
        <Alert
          variant={result.state === 'stopped' || result.failed > 0 ? 'warning' : 'success'}
          dismissible
          onClose={dismissResult}
          className="mb-0 fs-6 shadow"
        >
          {runMessage(result, t as never)}
        </Alert>
      )}
    </div>
  );
};
