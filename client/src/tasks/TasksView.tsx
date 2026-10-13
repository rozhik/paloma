import React, { useState } from 'react';
import { Alert, Badge, Button, ProgressBar } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, GripVertical, ListChecks, Pause, Play, Trash2, X } from 'lucide-react';
import type { TaskInfo } from '../../../shared/types.js';
import { grantedPermissions } from '../auth/authStore.js';
import { describeError } from '../api/http.js';
import { useFormat } from '../i18n/format.js';
import { progressShare, stateLabel, taskMessage, taskStarter, taskTitle } from './taskText.js';
import { canDropBefore, isActive, isEnded, useTasks, useTasksViewOpen } from './useTasks.js';

/** With users off, or with users.manage, the user moves any task anywhere; otherwise only their own among themselves. */
export const controlsAllTasks = (): boolean => {
  const granted = grantedPermissions();
  return granted === null || granted.has('users.manage');
};

const movable = (task: TaskInfo) => task.canControl && (task.state === 'waiting' || task.state === 'paused');

/**
 * Where Move up and Move down put a task: before the previous slot, or before the one after the next (null: the
 * end). The slots are the tasks this user may move it among.
 */
export function moveTargets(task: TaskInfo, tasks: readonly TaskInfo[], controlsAll: boolean): { up: string | null | undefined; down: string | null | undefined } {
  const slots = tasks.filter((other) => (other.state === 'waiting' || other.state === 'paused') && (controlsAll || other.mine));
  const index = slots.findIndex((other) => other.id === task.id);
  if (index === -1) return { up: undefined, down: undefined };
  return {
    up: index > 0 ? slots[index - 1].id : undefined,
    down: index < slots.length - 1 ? slots[index + 2]?.id ?? null : undefined,
  };
}

const STATE_VARIANT: Record<TaskInfo['state'], string> = {
  running: 'primary', pausing: 'secondary', cancelling: 'secondary', waiting: 'light', paused: 'secondary',
  finished: 'success', cancelled: 'secondary', failed: 'danger',
};

const TaskRow: React.FC<{
  task: TaskInfo;
  tasks: readonly TaskInfo[];
  controlsAll: boolean;
  dragged: TaskInfo | null;
  onDragStart: (task: TaskInfo) => void;
  onDragEnd: () => void;
}> = ({ task, tasks, controlsAll, dragged, onDragStart, onDragEnd }) => {
  const { t } = useTranslation();
  const { formatNumber, formatDateTime } = useFormat();
  const { act, move } = useTasks();
  const [over, setOver] = useState(false);
  const title = taskTitle(task, t as never);
  const canMove = movable(task);
  const targets = canMove ? moveTargets(task, tasks, controlsAll) : { up: undefined, down: undefined };
  const droppable = dragged !== null && canDropBefore(dragged, task, tasks, controlsAll);
  const ended = isEnded(task);
  return (
    <li
      className={`list-group-item pal-surface d-flex align-items-start gap-2 py-3${over ? ' border-primary border-2' : ''}`}
      data-task={task.id}
      draggable={canMove}
      onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDragStart(task); }}
      onDragEnd={() => { setOver(false); onDragEnd(); }}
      onDragOver={(event) => {
        if (!droppable) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (dragged && droppable) void move(dragged.id, task.id);
      }}
    >
      <span className="pt-1" style={{ width: 20, cursor: canMove ? 'grab' : undefined }} aria-hidden="true">
        {canMove && <GripVertical size={20} />}
      </span>
      <div className="flex-grow-1 min-w-0">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fs-5 fw-semibold text-break">{title}</span>
          <Badge bg={STATE_VARIANT[task.state]} text={task.state === 'waiting' ? 'dark' : undefined}>{stateLabel(task, t as never)}</Badge>
        </div>
        <div className="small opacity-75">
          {t('tasks.startedBy', { name: taskStarter(task, t as never), date: formatDateTime(task.createdAt) })}
        </div>
        {!ended && (
          <div className="d-flex align-items-center gap-2 mt-2">
            <ProgressBar now={progressShare(task) * 100} className="flex-grow-1" style={{ height: 8 }} aria-label={title} />
            <span className="small text-nowrap" dir="ltr">{`${formatNumber(task.done)} / ${formatNumber(task.total)}`}</span>
          </div>
        )}
        {ended && task.mine && <div className="small mt-1">{taskMessage(task, t as never)}</div>}
        {ended && !task.mine && task.failed > 0 && <div className="small mt-1">{t('tasks.failedCount', { count: task.failed })}</div>}
      </div>
      {task.canControl && (
        <div className="d-flex flex-wrap justify-content-end gap-1">
          {canMove && targets.up !== undefined && (
            <Button size="sm" variant="outline-secondary" aria-label={t('tasks.moveUp', { task: title })} title={t('tasks.moveUp', { task: title })} onClick={() => void move(task.id, targets.up!)}>
              <ArrowUp size={16} aria-hidden="true" />
            </Button>
          )}
          {canMove && targets.down !== undefined && (
            <Button size="sm" variant="outline-secondary" aria-label={t('tasks.moveDown', { task: title })} title={t('tasks.moveDown', { task: title })} onClick={() => void move(task.id, targets.down!)}>
              <ArrowDown size={16} aria-hidden="true" />
            </Button>
          )}
          {(task.state === 'running' || task.state === 'waiting') && (
            <Button size="sm" variant="outline-secondary" className="d-inline-flex align-items-center gap-1" onClick={() => void act('pause', task.id)}>
              <Pause size={16} aria-hidden="true" /><span>{t('tasks.pause')}</span>
            </Button>
          )}
          {(task.state === 'paused' || task.state === 'pausing') && (
            <Button size="sm" variant="outline-primary" className="d-inline-flex align-items-center gap-1" onClick={() => void act('resume', task.id)}>
              <Play size={16} aria-hidden="true" /><span>{t('tasks.resume')}</span>
            </Button>
          )}
          {isActive(task) && task.state !== 'cancelling' && (
            <Button size="sm" variant="outline-danger" className="d-inline-flex align-items-center gap-1" onClick={() => void act('cancel', task.id)}>
              <X size={16} aria-hidden="true" /><span>{t('tasks.cancel')}</span>
            </Button>
          )}
          {ended && (
            <Button size="sm" variant="outline-secondary" aria-label={t('tasks.remove', { task: title })} title={t('tasks.remove', { task: title })} onClick={() => void act('cancel', task.id)}>
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
};

/**
 * The task queue, opened from the user menu: the running task, the waiting and paused tasks in queue order, then
 * the ended ones. Everyone sees every task with who started it; the user pauses, resumes, cancels and drags the
 * tasks they may change.
 */
export const TasksView: React.FC = () => {
  const { t } = useTranslation();
  useTasksViewOpen();
  const { tasks, error, dismissError, move } = useTasks();
  const [dragged, setDragged] = useState<TaskInfo | null>(null);
  const controlsAll = controlsAllTasks();
  const queue = tasks.filter(isActive);
  const ended = tasks.filter(isEnded);
  const dropAtEnd = dragged !== null && canDropBefore(dragged, null, tasks, controlsAll);
  const row = (task: TaskInfo) => (
    <TaskRow key={task.id} task={task} tasks={tasks} controlsAll={controlsAll} dragged={dragged} onDragStart={setDragged} onDragEnd={() => setDragged(null)} />
  );
  return (
    <main className="flex-grow-1 pal-page overflow-auto p-4">
      <div className="mx-auto" style={{ maxWidth: '900px' }}>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-3">
          <ListChecks size={30} aria-hidden="true" />
          <span>{t('tasks.title.view')}</span>
        </h2>
        {error != null && <Alert variant="danger" dismissible onClose={dismissError}>{describeError(error, t)}</Alert>}
        <h3 className="fs-4 fw-semibold mb-2">{t('tasks.queue')}</h3>
        {queue.length === 0
          ? <p className="opacity-75">{t('tasks.empty')}</p>
          : <ul className="list-group mb-2">{queue.map(row)}</ul>}
        {dropAtEnd && (
          <div
            className="border border-2 border-primary rounded p-2 text-center small mb-2"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void move(dragged.id, null);
              setDragged(null);
            }}
          >
            {t('tasks.dropAtEnd')}
          </div>
        )}
        {ended.length > 0 && (
          <>
            <h3 className="fs-4 fw-semibold mb-2 mt-4">{t('tasks.ended')}</h3>
            <ul className="list-group">{ended.map(row)}</ul>
          </>
        )}
      </div>
    </main>
  );
};
