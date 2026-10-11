import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { RotateCw, Settings2, Sparkles } from 'lucide-react';
import type { AiTask, Photo } from '../../../shared/types.js';
import { useAllows } from '../levels/controls.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { taskName, taskUnavailable } from './aiText.js';
import { useAiTasks, useMenuTasks } from './aiTasks.js';
import { useAiRun } from './useAiRun.js';

/** A menu item for a task: disabled, with the reason under its name, when it cannot start. */
const TaskItem: React.FC<{ task: AiTask; running: boolean; again?: boolean; onRun: () => void }> = ({ task, running, again, onRun }) => {
  const { t } = useTranslation();
  const reason = taskUnavailable(task, running, t as never);
  return (
    <Dropdown.Item as="button" type="button" disabled={reason !== null} onClick={onRun} data-ai-task={task.id} data-ai-again={again ? 'true' : undefined}>
      <span className="d-flex align-items-center gap-2">
        {again ? <RotateCw size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
        <span>{taskName(task, t)}</span>
      </span>
      {reason && <small className="d-block text-wrap text-secondary ms-4">{reason}</small>}
    </Dropdown.Item>
  );
};

/** The items of an AI menu: each task, then Run again for each, then a link to the AI settings when allowed. */
export const AiMenuItems: React.FC<{ tasks: AiTask[]; onRun: (task: AiTask, again: boolean) => void }> = ({ tasks, onRun }) => {
  const { t } = useTranslation();
  const running = useAiRun((state) => state.current !== null);
  const canConfigure = useAllows('view.server');
  const setCurrentView = usePalomaStore((state) => state.setCurrentView);
  return (
    <>
      <Dropdown.Header>{t('ai.menu.label')}</Dropdown.Header>
      {tasks.length === 0 && <Dropdown.ItemText className="text-secondary text-wrap">{t('ai.menu.empty')}</Dropdown.ItemText>}
      {tasks.map((task) => <TaskItem key={task.id} task={task} running={running} onRun={() => onRun(task, false)} />)}
      {tasks.length > 0 && (
        <>
          <Dropdown.Divider />
          <Dropdown.Header>{t('ai.menu.runAgain')}</Dropdown.Header>
          {tasks.map((task) => <TaskItem key={task.id} task={task} running={running} again onRun={() => onRun(task, true)} />)}
        </>
      )}
      {canConfigure && (
        <>
          <Dropdown.Divider />
          <Dropdown.Item as="button" type="button" onClick={() => setCurrentView('server')} className="d-flex align-items-center gap-2">
            <Settings2 size={16} aria-hidden="true" />
            <span>{t('ai.menu.settings')}</span>
          </Dropdown.Item>
        </>
      )}
    </>
  );
};

/**
 * Next to Find faces in grid headers: runs an AI task on every photo the grid shows. Offered from Normal to users
 * who may run AI tasks, while the grid has photos.
 */
export const AiMenu: React.FC<{ photos: Photo[] }> = ({ photos }) => {
  const { t } = useTranslation();
  const allowed = useAllows('ai.run');
  const tasks = useMenuTasks(allowed);
  if (!allowed || photos.length === 0) return null;
  return (
    <Dropdown onToggle={(open) => { if (open) void useAiTasks.getState().load(true); }}>
      <Dropdown.Toggle variant="outline-primary" className="btn-lg-custom d-inline-flex align-items-center gap-2" aria-label={t('ai.menu.label')}>
        <Sparkles size={20} aria-hidden="true" />
        <span>{t('ai.menu.button')}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="shadow" style={{ maxWidth: '22rem' }}>
        <AiMenuItems tasks={tasks} onRun={(task, again) => { void useAiRun.getState().run(task.id, photos, again); }} />
      </Dropdown.Menu>
    </Dropdown>
  );
};
