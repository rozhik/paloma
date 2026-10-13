import React from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { TaskInfo } from '../../../shared/types.js';
import { describeError } from '../api/http.js';
import { useAiRun } from '../ai/useAiRun.js';
import { useFaceDetection } from '../faces/useFaceDetection.js';
import { useFormat } from '../i18n/format.js';
import { useAllows } from '../levels/controls.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { progressShare, taskMessage, taskTitle } from './taskText.js';
import { isActive, useTaskPolling, useTasks } from './useTasks.js';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The ring: filled to the share done of the running task with `done / total` inside, or the number waiting. */
export const TaskRing: React.FC<{ running: TaskInfo | null; waiting: number; onOpen: () => void }> = ({ running, waiting, onOpen }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const share = running ? progressShare(running) : 0;
  const label = running
    ? t('tasks.indicator.running', { task: taskTitle(running, t), done: running.done, total: running.total })
    : t('tasks.indicator.waiting', { count: waiting });
  return (
    <button type="button" className="face-progress pal-surface" aria-label={label} title={label} onClick={onOpen}>
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
      <span className="face-progress-count" dir="ltr">
        {running ? `${formatNumber(running.done)} / ${formatNumber(running.total)}` : `+${formatNumber(waiting)}`}
      </span>
    </button>
  );
};

const messageVariant = (task: TaskInfo) => (task.state === 'finished' && task.failed === 0 ? 'success' : 'warning');

/**
 * Over every view: while the user has tasks in the queue, a ring with the progress of their running task or the
 * number of their waiting ones, opening the Tasks view; and a message when one of their tasks ends. The views
 * behind stay usable.
 */
export const TaskIndicator: React.FC = () => {
  const { t } = useTranslation();
  const allowed = useAllows('view.tasks');
  useTaskPolling(allowed);
  const { tasks, ended, error, dismissEnded, dismissError } = useTasks();
  const aiError = useAiRun((state) => state.error);
  const faces = useFaceDetection();
  const currentView = usePalomaStore((state) => state.currentView);
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  if (!allowed) return null;

  const own = tasks.filter((task) => task.mine && isActive(task));
  const running = own.find((task) => task.state === 'running' || task.state === 'pausing' || task.state === 'cancelling') ?? null;
  const waiting = own.filter((task) => task.state === 'waiting' || task.state === 'paused').length;
  const showRing = (running !== null || waiting > 0) && currentView !== 'tasks';
  const errors = [error, aiError, faces.error].filter((e) => e != null);
  if (!showRing && ended.length === 0 && errors.length === 0 && !faces.nothingToDo) return null;

  const dismissErrors = () => {
    dismissError();
    useAiRun.getState().dismissError();
    faces.dismiss();
  };
  return (
    <div className="face-progress-dock d-flex flex-column align-items-end gap-2" aria-live="polite">
      {errors.length > 0 && (
        <Alert variant="danger" dismissible onClose={dismissErrors} className="mb-0 fs-6 shadow">{describeError(errors[0], t)}</Alert>
      )}
      {faces.nothingToDo && (
        <Alert variant="info" dismissible onClose={faces.dismiss} className="mb-0 fs-6 shadow">{t('faces.nothingToDo')}</Alert>
      )}
      {ended.map((task) => (
        <Alert key={task.id} variant={messageVariant(task)} dismissible onClose={() => dismissEnded(task.id)} className="mb-0 fs-6 shadow">
          {taskMessage(task, t as never)}
        </Alert>
      ))}
      {showRing && <TaskRing running={running} waiting={waiting} onOpen={() => setCurrentView('tasks')} />}
    </div>
  );
};
