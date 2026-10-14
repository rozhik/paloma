import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Coins, ListChecks, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import type { AiProviderInfo, AiProviderSummary, AiTask } from '../../../shared/types.js';
import { deleteAiTask, fetchAiProviders, fetchAiTasks, resetAiTask } from '../api/ai.js';
import { describeError } from '../api/http.js';
import { fetchPlugins } from '../api/plugins.js';
import { currentLanguage } from '../i18n/index.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { outputLabel, problemLabel, taskName } from './aiText.js';
import { AiModelsModal } from './AiModelsModal.js';
import { ProvidersPanel, providerTypes } from './ProvidersPanel.js';
import { TaskEditor } from './TaskEditor.js';
import { useAiTasks } from './aiTasks.js';

/** The list of tasks with what each one uses and whether it can run, and the actions allowed on it. */
export const TasksList: React.FC<{
  tasks: AiTask[];
  providers: AiProviderInfo[];
  onEdit: (task: AiTask) => void;
  onReset: (task: AiTask) => void;
  onDelete: (task: AiTask) => void;
}> = ({ tasks, providers, onEdit, onReset, onDelete }) => {
  const { t } = useTranslation();
  const providerLabel = (id: string | null) => (id === null ? t('ai.editor.noProvider') : providers.find((p) => p.id === id)?.name ?? id);
  return (
    <div className="d-flex flex-column gap-2">
      {tasks.map((task) => (
        <div key={task.id} className="card shadow-sm">
          <div className="card-body d-flex align-items-start gap-3 flex-wrap">
            <div className="flex-grow-1">
              <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                <h5 className="fw-bold mb-0">{taskName(task, t)}</h5>
                <Badge bg="secondary" className="fs-6">{outputLabel(task.output, t)}</Badge>
                {task.builtIn && <Badge bg="light" text="dark" className="fs-6 border">{t('ai.tasks.builtIn')}</Badge>}
                {!task.inMenu && <Badge bg="light" text="dark" className="fs-6 border">{t('ai.tasks.notInMenu')}</Badge>}
              </div>
              <p className="mb-1 text-secondary">
                {providerLabel(task.provider)}{task.model ? <> · <span dir="ltr">{task.model}</span></> : null}
              </p>
              {task.ready
                ? <span className="text-success fw-semibold">{t('ai.tasks.ready')}</span>
                : <span className="text-warning-emphasis fw-semibold">{problemLabel(task.problem!, t)}</span>}
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <Button variant="outline-primary" onClick={() => onEdit(task)} className="d-flex align-items-center gap-1">
                <Pencil size={16} aria-hidden="true" /><span>{t('ai.tasks.edit')}</span>
              </Button>
              {task.builtIn ? (
                <Button variant="outline-secondary" onClick={() => onReset(task)} className="d-flex align-items-center gap-1">
                  <RotateCcw size={16} aria-hidden="true" /><span>{t('ai.tasks.reset')}</span>
                </Button>
              ) : (
                <Button variant="outline-danger" onClick={() => onDelete(task)} className="d-flex align-items-center gap-1">
                  <Trash2 size={16} aria-hidden="true" /><span>{t('ai.tasks.delete')}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/** Server settings → AI: providers with their settings, and the tasks the AI menus offer. */
export const AiSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  // Switching a plugin in the Plugins section bumps this, and providers may come or go
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const [providers, setProviders] = useState<AiProviderInfo[] | null>(null);
  const [types, setTypes] = useState<AiProviderSummary[]>([]);
  const [tasks, setTasks] = useState<AiTask[] | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AiTask | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ task: AiTask; action: 'reset' | 'delete' } | null>(null);

  const load = () => Promise.all([fetchAiProviders(currentLanguage()), fetchAiTasks(), fetchPlugins(currentLanguage())])
    .then(([p, list, plugins]) => {
      setProviders(p);
      setTasks(list);
      setTypes(providerTypes(plugins.flatMap((plugin) => plugin.aiProviders)));
      useAiTasks.setState({ tasks: list });
    })
    .catch((err) => setError(describeError(err, t)));

  useEffect(() => { void load(); }, [i18n.language, libraryVersion]);

  const confirmed = async () => {
    if (!confirm) return;
    const { task, action } = confirm;
    setConfirm(null);
    setError(null);
    try {
      if (action === 'reset') await resetAiTask(task.id);
      else await deleteAiTask(task.id);
      await load();
    } catch (err) {
      setError(describeError(err, t));
    }
  };

  return (
    <section className="mb-4" aria-labelledby="server-ai">
      <h3 id="server-ai" className="fs-3 fw-bold mt-4 mb-1 d-flex align-items-center gap-2">
        <Sparkles size={26} aria-hidden="true" />
        <span>{t('ai.title')}</span>
      </h3>
      <p className="fs-5 text-secondary">{t('ai.intro')}</p>
      {error && <Alert variant="danger" className="fs-5" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {(providers === null || tasks === null) && !error && (
        <div className="d-flex align-items-center gap-2 fs-5 text-secondary"><Spinner animation="border" size="sm" /><span>{t('ai.loading')}</span></div>
      )}
      {providers && (
        <ProvidersPanel providers={providers} types={types} onSaved={() => { void load(); }} onChanged={() => { void load(); }} />
      )}
      <div className="mb-3">
        <Button variant="outline-secondary" onClick={() => setShowUsage(true)} className="d-inline-flex align-items-center gap-2">
          <Coins size={18} aria-hidden="true" /><span>{t('ai.models.openDialog')}</span>
        </Button>
      </div>
      <AiModelsModal show={showUsage} onHide={() => setShowUsage(false)} />
      {providers && tasks && (
        <div>
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
            <h4 className="fs-4 fw-bold mb-0 d-flex align-items-center gap-2">
              <ListChecks size={22} aria-hidden="true" />
              <span>{t('ai.tasks.title')}</span>
            </h4>
            <Button onClick={() => setEditing('new')} className="d-flex align-items-center gap-1">
              <Plus size={18} aria-hidden="true" /><span>{t('ai.tasks.add')}</span>
            </Button>
          </div>
          <p className="text-secondary">{t('ai.tasks.intro')}</p>
          <TasksList
            tasks={tasks}
            providers={providers}
            onEdit={setEditing}
            onReset={(task) => setConfirm({ task, action: 'reset' })}
            onDelete={(task) => setConfirm({ task, action: 'delete' })}
          />
          <TaskEditor
            task={editing === 'new' ? null : editing}
            providers={providers}
            show={editing !== null}
            onHide={() => setEditing(null)}
            onSaved={() => { setEditing(null); void load(); }}
          />
        </div>
      )}
      <ConfirmModal
        show={confirm !== null}
        title={confirm ? t(confirm.action === 'reset' ? 'ai.tasks.resetTitle' : 'ai.tasks.deleteTitle', { name: taskName(confirm.task, t) }) : ''}
        body={confirm ? t(confirm.action === 'reset' ? 'ai.tasks.resetBody' : 'ai.tasks.deleteBody') : ''}
        confirmLabel={confirm?.action === 'delete' ? t('ai.tasks.delete') : t('ai.tasks.reset')}
        variant={confirm?.action === 'delete' ? 'danger' : 'primary'}
        onConfirm={() => void confirmed()}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
};
