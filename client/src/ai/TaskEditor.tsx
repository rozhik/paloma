import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type {
  AiModelInfo, AiModelOptionInfo, AiOutputKind, AiProviderInfo, AiTask, AiTaskInput, AiTaskOptions, AiTextTarget,
} from '../../../shared/types.js';
import { createAiTask, fetchCatalogModels, updateAiTask } from '../api/ai.js';
import { describeError } from '../api/http.js';
import { LANGUAGES } from '../i18n/languages.js';
import { PROMPT_PLACEHOLDERS, outputLabel, taskName } from './aiText.js';

const OUTPUTS: AiOutputKind[] = ['tags', 'objects', 'text'];
const TEXT_TARGETS: AiTextTarget[] = ['description-if-empty', 'description-always', 'none'];

/** What the editor edits: a task's fields; `name` empty means a built-in task's default name. */
export interface TaskDraft {
  name: string;
  output: AiOutputKind;
  inMenu: boolean;
  provider: string;
  model: string;
  prompt: string;
  modelOptions: Record<string, string | number | boolean>;
  options: AiTaskOptions;
}

export const draftOf = (task: AiTask | null, providers: AiProviderInfo[]): TaskDraft => (task ? {
  name: task.name ?? '', output: task.output, inMenu: task.inMenu, provider: task.provider ?? '', model: task.model ?? '',
  prompt: task.prompt, modelOptions: { ...task.modelOptions }, options: { ...task.options },
} : {
  name: '', output: 'tags', inMenu: true, provider: providers.find((p) => p.available)?.id ?? '', model: '', prompt: '', modelOptions: {},
  options: { imageSize: 1024, language: 'user', parallel: 2, maxTags: 10, minConfidence: 0.5 },
});

/** The options of an output kind with their defaults, keeping the values `options` already has. */
export function optionsForOutput(output: AiOutputKind, options: AiTaskOptions): AiTaskOptions {
  const common = { imageSize: options.imageSize, language: options.language, parallel: options.parallel };
  if (output === 'tags') return { ...common, maxTags: options.maxTags ?? 10, minConfidence: options.minConfidence ?? 0.5 };
  if (output === 'objects') return { ...common, minConfidence: options.minConfidence ?? 0.5, labelsAsTags: options.labelsAsTags ?? false };
  return { ...common, textTarget: options.textTarget ?? 'description-if-empty' };
}

/** The body to save: a new task gets every field; a built-in task's output is never sent. */
export function taskInput(draft: TaskDraft, task: AiTask | null): AiTaskInput {
  const input: AiTaskInput = {
    name: draft.name.trim() === '' ? null : draft.name.trim(),
    inMenu: draft.inMenu,
    provider: draft.provider === '' ? null : draft.provider,
    model: draft.model.trim() === '' ? null : draft.model.trim(),
    prompt: draft.prompt,
    modelOptions: draft.modelOptions,
    options: optionsForOutput(draft.output, draft.options),
  };
  if (!task?.builtIn) input.output = draft.output;
  return input;
}

const ModelOption: React.FC<{ option: AiModelOptionInfo; value: string | number | boolean | undefined; onChange: (value: string | number | boolean | null) => void }> = ({ option, value, onChange }) => {
  const { t } = useTranslation();
  const id = `ai-model-option-${option.name}`;
  const fallback = t('ai.editor.default', { value: String(option.default) });
  if (option.type === 'boolean') {
    return <Form.Check type="switch" id={id} className="mb-3" label={option.label} checked={(value ?? option.default) === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  return (
    <Form.Group className="mb-3">
      <Form.Label htmlFor={id} className="fw-semibold">{option.label}</Form.Label>
      {option.type === 'choice' ? (
        <Form.Select id={id} value={value === undefined ? '' : String(value)} onChange={(e) => {
          const chosen = option.options.find((o) => String(o.value) === e.target.value);
          onChange(chosen ? chosen.value : null);
        }}>
          <option value="">{fallback}</option>
          {option.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </Form.Select>
      ) : (
        <Form.Control id={id} type="number" min={option.min} max={option.max} step={option.step} placeholder={fallback}
          value={value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
      )}
    </Form.Group>
  );
};

const NumberOption: React.FC<{ id: string; label: string; help?: string; value: number | undefined; min: number; max: number; step?: number; onChange: (value: number) => void }> = ({ id, label, help, value, min, max, step = 1, onChange }) => (
  <Form.Group className="mb-3">
    <Form.Label htmlFor={id} className="fw-semibold">{label}</Form.Label>
    <Form.Control id={id} type="number" min={min} max={max} step={step} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
    {help && <Form.Text>{help}</Form.Text>}
  </Form.Group>
);

/** Adds a task or edits one: provider and model, prompt with its placeholders, model options and task options. */
export const TaskEditor: React.FC<{
  task: AiTask | null;
  providers: AiProviderInfo[];
  show: boolean;
  onHide: () => void;
  onSaved: (task: AiTask) => void;
}> = ({ task, providers, show, onHide, onSaved }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TaskDraft>(() => draftOf(task, providers));
  const [models, setModels] = useState<AiModelInfo[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const provider = providers.find((p) => p.id === draft.provider);

  useEffect(() => {
    if (show) {
      setDraft(draftOf(task, providers));
      setError(null);
    }
  }, [show, task]);

  useEffect(() => {
    setModels(null);
    setModelsError(null);
    if (!show || !provider) return;
    let cancelled = false;
    fetchCatalogModels()
      .then((list) => {
        if (!cancelled) setModels(list.filter((m) => m.providerId === provider.id && m.enabled).map((m) => ({ id: m.id, label: m.id })));
      })
      .catch((err) => { if (!cancelled) setModelsError(describeError(err, t)); });
    return () => { cancelled = true; };
  }, [show, provider?.id]);

  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setOption = (patch: Partial<AiTaskOptions>) => setDraft((d) => ({ ...d, options: { ...d.options, ...patch } }));

  const insertPlaceholder = (name: string) => {
    const field = promptRef.current;
    const text = `{${name}}`;
    const start = field?.selectionStart ?? draft.prompt.length;
    const end = field?.selectionEnd ?? draft.prompt.length;
    set({ prompt: draft.prompt.slice(0, start) + text + draft.prompt.slice(end) });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = task ? await updateAiTask(task.id, taskInput(draft, task)) : await createAiTask(taskInput(draft, null));
      onSaved(saved);
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const { options } = draft;
  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable>
      <Form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Modal.Header closeButton>
          <Modal.Title>{task ? t('ai.editor.editTitle', { name: taskName(task, t) }) : t('ai.editor.addTitle')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-6">
          <Form.Group className="mb-3">
            <Form.Label htmlFor="ai-task-name" className="fw-semibold">{t('ai.editor.name')}</Form.Label>
            <Form.Control id="ai-task-name" value={draft.name} maxLength={100} required={!task?.builtIn}
              placeholder={task?.builtIn ? taskName({ id: task.id, name: null }, t) : undefined} onChange={(e) => set({ name: e.target.value })} />
          </Form.Group>

          <div className="row">
            <Form.Group className="mb-3 col-sm-6">
              <Form.Label htmlFor="ai-task-output" className="fw-semibold">{t('ai.editor.output')}</Form.Label>
              <Form.Select id="ai-task-output" value={draft.output} disabled={task?.builtIn}
                onChange={(e) => { const output = e.target.value as AiOutputKind; set({ output, options: optionsForOutput(output, draft.options) }); }}>
                {OUTPUTS.map((o) => <option key={o} value={o}>{outputLabel(o, t)}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3 col-sm-6 d-flex align-items-end">
              <Form.Check type="switch" id="ai-task-in-menu" label={t('ai.editor.inMenu')} checked={draft.inMenu} onChange={(e) => set({ inMenu: e.target.checked })} />
            </Form.Group>
          </div>

          <div className="row">
            <Form.Group className="mb-3 col-sm-6">
              <Form.Label htmlFor="ai-task-provider" className="fw-semibold">{t('ai.editor.provider')}</Form.Label>
              <Form.Select id="ai-task-provider" value={draft.provider} onChange={(e) => set({ provider: e.target.value, modelOptions: {} })}>
                <option value="">{t('ai.editor.noProvider')}</option>
                {providers.filter((p) => p.available).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                {draft.provider !== '' && !providers.some((p) => p.id === draft.provider && p.available) && <option value={draft.provider}>{t('ai.editor.unavailable', { id: provider?.name ?? draft.provider })}</option>}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3 col-sm-6">
              <Form.Label htmlFor="ai-task-model" className="fw-semibold">{t('ai.editor.model')}</Form.Label>
              <Form.Control id="ai-task-model" list="ai-task-models" dir="ltr" value={draft.model} maxLength={200}
                placeholder={t('ai.editor.modelPlaceholder')} onChange={(e) => set({ model: e.target.value })} />
              <datalist id="ai-task-models">
                {models?.map((m) => <option key={m.id} value={m.id}>{m.label !== m.id ? m.label : undefined}</option>)}
              </datalist>
              {provider && models === null && !modelsError && <Form.Text><Spinner animation="border" size="sm" /> {t('ai.editor.loadingModels')}</Form.Text>}
              {modelsError && <Form.Text className="text-danger">{t('ai.editor.modelsFailed', { message: modelsError })}</Form.Text>}
              {models && <Form.Text>{t('ai.editor.modelsCount', { count: models.length })}</Form.Text>}
            </Form.Group>
          </div>

          <Form.Group className="mb-3">
            <Form.Label htmlFor="ai-task-prompt" className="fw-semibold">{t('ai.editor.prompt')}</Form.Label>
            <Form.Control id="ai-task-prompt" as="textarea" rows={6} ref={promptRef} value={draft.prompt} required onChange={(e) => set({ prompt: e.target.value })} />
            <div className="d-flex flex-wrap gap-1 mt-2 align-items-center">
              <span className="text-secondary me-1">{t('ai.editor.placeholders')}</span>
              {PROMPT_PLACEHOLDERS.map((name) => (
                <Button key={name} size="sm" variant="outline-secondary" title={t(`ai.placeholder.${name}`)} onClick={() => insertPlaceholder(name)}>
                  <span dir="ltr">{`{${name}}`}</span>
                </Button>
              ))}
            </div>
            <ul className="text-secondary small mt-2 mb-0">
              {PROMPT_PLACEHOLDERS.map((name) => <li key={name}><code dir="ltr">{`{${name}}`}</code> — {t(`ai.placeholder.${name}`)}</li>)}
            </ul>
          </Form.Group>

          {provider && provider.modelOptions.length > 0 && (
            <fieldset className="mb-2">
              <legend className="fs-5 fw-bold">{t('ai.editor.modelOptions')}</legend>
              {provider.modelOptions.map((option) => (
                <ModelOption key={option.name} option={option} value={draft.modelOptions[option.name]} onChange={(value) => {
                  const next = { ...draft.modelOptions };
                  if (value === null) delete next[option.name];
                  else next[option.name] = value;
                  set({ modelOptions: next });
                }} />
              ))}
            </fieldset>
          )}

          <fieldset>
            <legend className="fs-5 fw-bold">{t('ai.editor.taskOptions')}</legend>
            <div className="row">
              <div className="col-sm-6">
                <NumberOption id="ai-opt-size" label={t('ai.option.imageSize')} help={t('ai.option.imageSizeHelp')} value={options.imageSize} min={256} max={2048} step={64} onChange={(imageSize) => setOption({ imageSize })} />
              </div>
              <div className="col-sm-6">
                <NumberOption id="ai-opt-parallel" label={t('ai.option.parallel')} value={options.parallel} min={1} max={8} onChange={(parallel) => setOption({ parallel })} />
              </div>
            </div>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="ai-opt-language" className="fw-semibold">{t('ai.option.language')}</Form.Label>
              <Form.Select id="ai-opt-language" value={options.language} onChange={(e) => setOption({ language: e.target.value })}>
                <option value="user">{t('ai.option.languageUser')}</option>
                {LANGUAGES.map((l) => <option key={l.tag} value={l.tag}>{l.nativeName}</option>)}
              </Form.Select>
            </Form.Group>
            {draft.output === 'tags' && (
              <NumberOption id="ai-opt-max-tags" label={t('ai.option.maxTags')} value={options.maxTags} min={1} max={50} onChange={(maxTags) => setOption({ maxTags })} />
            )}
            {draft.output !== 'text' && (
              <NumberOption id="ai-opt-confidence" label={t('ai.option.minConfidence')} help={t('ai.option.minConfidenceHelp')} value={options.minConfidence} min={0} max={1} step={0.05} onChange={(minConfidence) => setOption({ minConfidence })} />
            )}
            {draft.output === 'objects' && (
              <Form.Check type="switch" id="ai-opt-labels" className="mb-3" label={t('ai.option.labelsAsTags')} checked={options.labelsAsTags === true} onChange={(e) => setOption({ labelsAsTags: e.target.checked })} />
            )}
            {draft.output === 'text' && (
              <Form.Group className="mb-3">
                <Form.Label htmlFor="ai-opt-target" className="fw-semibold">{t('ai.option.textTarget')}</Form.Label>
                <Form.Select id="ai-opt-target" value={options.textTarget} onChange={(e) => setOption({ textTarget: e.target.value as AiTextTarget })}>
                  {TEXT_TARGETS.map((target) => <option key={target} value={target}>{t(`ai.option.target.${target}`)}</option>)}
                </Form.Select>
              </Form.Group>
            )}
          </fieldset>
          {error && <Alert variant="danger" className="mb-0">{error}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? <Spinner animation="border" size="sm" /> : t('common.save')}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};
