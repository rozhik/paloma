import React from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { AiTask, PhotoAiResult } from '../../../shared/types.js';
import { useFormat } from '../i18n/format.js';
import { useAllows } from '../levels/controls.js';
import { objectLabel } from './ObjectFrames.js';
import { taskName } from './aiText.js';
import { useMenuTasks } from './aiTasks.js';
import { useAiRun } from './useAiRun.js';
import { usePhotoAiResults } from './usePhotoAiResults.js';

/** One result: the task, model and date, and the tags, object labels or text. */
const ResultView: React.FC<{ result: PhotoAiResult }> = ({ result }) => {
  const { t, i18n } = useTranslation();
  const { formatDateTime } = useFormat();
  let body: React.ReactNode;
  if (result.output === 'text') {
    body = <p dir="auto" className="mb-0" style={{ whiteSpace: 'pre-line' }}>{result.text}</p>;
  } else {
    const labels = result.output === 'tags'
      ? (result.tags ?? []).map((tag) => tag.name)
      : (result.objects ?? []).map((object) => objectLabel(object, i18n.language));
    body = labels.length === 0
      ? <p className="mb-0 opacity-75">{result.output === 'tags' ? t('ai.info.noTags') : t('ai.info.noObjects')}</p>
      : <div className="d-flex flex-wrap gap-1">{labels.map((label, i) => <span key={i} dir="auto" className="badge pal-badge">{label}</span>)}</div>;
  }
  return (
    <div className="mb-2" data-ai-result={result.taskId}>
      <div className="fw-semibold">{taskName({ id: result.taskId, name: result.taskName }, t)}</div>
      <div className="small opacity-75 mb-1">
        {t('ai.info.byModel', { model: result.model, date: formatDateTime(result.createdAt) })}
      </div>
      {body}
    </div>
  );
};

/**
 * The AI section's content: the photo's results, or a note that it has none, and for users who may run AI
 * tasks a button per ready task that runs it again on this photo.
 */
export const AiResultsView: React.FC<{
  results: PhotoAiResult[];
  tasks: AiTask[];
  running: boolean;
  onRun?: (task: AiTask) => void;
}> = ({ results, tasks, running, onRun }) => {
  const { t } = useTranslation();
  const ready = tasks.filter((task) => task.ready);
  return (
    <>
      {results.length === 0 ? <p className="mb-2 opacity-75">{t('ai.info.none')}</p> : results.map((r) => <ResultView key={r.taskId} result={r} />)}
      {onRun && ready.length > 0 && (
        <div className="d-flex flex-wrap gap-1">
          {ready.map((task) => (
            <Button key={task.id} size="sm" variant="outline-primary" disabled={running} onClick={() => onRun(task)} className="d-inline-flex align-items-center gap-1">
              <Sparkles size={14} aria-hidden="true" />
              <span>{t('ai.info.run', { task: taskName(task, t) })}</span>
            </Button>
          ))}
          {running && <span className="small opacity-75 d-inline-flex align-items-center gap-1"><Spinner animation="border" size="sm" />{t('ai.info.running')}</span>}
        </div>
      )}
    </>
  );
};

/** The AI section of the Info panel for a photo; the results load again when a run ends. */
export const InfoPanelAi: React.FC<{ photoId: number }> = ({ photoId }) => {
  const canRun = useAllows('ai.run');
  const tasks = useMenuTasks(canRun);
  const running = useAiRun((state) => state.current !== null);
  const { results } = usePhotoAiResults(photoId);
  if (!results) return null;
  return (
    <AiResultsView
      results={results}
      tasks={tasks}
      running={running}
      onRun={canRun ? (task) => { void useAiRun.getState().run(task.id, [{ id: photoId }], true); } : undefined}
    />
  );
};
