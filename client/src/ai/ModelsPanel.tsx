import React, { useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import type { AiCapability, AiCatalogModel } from '../../../shared/types.js';
import { addAiModel, fetchCatalogModels, refreshAiModels, updateAiModel } from '../api/ai.js';
import { describeError } from '../api/http.js';
import { TOKEN_KINDS, draftOfModel, isChanged, modelInput, type ModelDraft } from './modelDraft.js';

/** The credits per 1,000,000 tokens of a model, for a read-only view. */
export const PriceList: React.FC<{ model: AiCatalogModel }> = ({ model }) => {
  const { t } = useTranslation();
  return (
    <dl className="d-flex flex-wrap gap-3 mb-0">
      {TOKEN_KINDS.map((kind) => (
        <div key={kind}>
          <dt className="small text-secondary fw-normal">{t(`ai.models.price.${kind}`)}</dt>
          <dd className="mb-0">{t('ai.models.perMillion', { credits: model.prices[kind] ?? 0 })}</dd>
        </div>
      ))}
    </dl>
  );
};

/** The graded capabilities of a model as small bars. */
export const CapabilityList: React.FC<{ capabilities: AiCapability[] }> = ({ capabilities }) => {
  const { t } = useTranslation();
  if (capabilities.length === 0) return <span className="text-secondary">{t('ai.models.noCapabilities')}</span>;
  return (
    <ul className="list-unstyled mb-0">
      {capabilities.map((c) => (
        <li key={c.name} className="d-flex align-items-center gap-2">
          <span className="flex-shrink-0" style={{ minWidth: '7rem' }}>{c.name}</span>
          <div className="progress flex-grow-1" style={{ height: '0.6rem' }} role="progressbar" aria-label={c.name} aria-valuenow={c.grade} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-bar" style={{ width: `${c.grade}%` }} />
          </div>
          <span className="text-secondary" style={{ minWidth: '2.5rem' }}>{c.grade}</span>
        </li>
      ))}
    </ul>
  );
};

/** What the provider reports about the model, as a list. */
export const ModelInfo: React.FC<{ info: Record<string, unknown> }> = ({ info }) => {
  const { t } = useTranslation();
  const entries = Object.entries(info);
  if (entries.length === 0) return <span className="text-secondary">{t('ai.models.noInfo')}</span>;
  return (
    <dl className="row mb-0 small">
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="col-sm-4 fw-normal text-secondary">{key}</dt>
          <dd className="col-sm-8 mb-0" dir="ltr">{typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

/** A model for anyone who can view the library: description, information, prices and capabilities, nothing to edit. */
export const ModelView: React.FC<{ model: AiCatalogModel }> = ({ model }) => {
  const { t } = useTranslation();
  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <h5 className="fw-bold mb-1" dir="ltr">{model.id}</h5>
        <p className="text-secondary mb-2">{model.description || t('ai.models.noDescription')}</p>
        <PriceList model={model} />
        <div className="mt-2"><CapabilityList capabilities={model.capabilities} /></div>
        <details className="mt-2">
          <summary>{t('ai.models.info')}</summary>
          <ModelInfo info={model.info} />
        </details>
      </div>
    </div>
  );
};

const CapabilitiesEditor: React.FC<{ draft: ModelDraft; onChange: (capabilities: ModelDraft['capabilities']) => void }> = ({ draft, onChange }) => {
  const { t } = useTranslation();
  const set = (index: number, patch: Partial<ModelDraft['capabilities'][number]>) => onChange(draft.capabilities.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  return (
    <div>
      {draft.capabilities.map((c, index) => (
        <div key={index} className="d-flex gap-2 mb-2 align-items-center">
          <Form.Control aria-label={t('ai.models.capabilityName')} value={c.name} maxLength={40} placeholder={t('ai.models.capabilityName')} onChange={(e) => set(index, { name: e.target.value })} />
          <Form.Control aria-label={t('ai.models.grade')} type="number" min={0} max={100} step={1} value={c.grade} style={{ maxWidth: '6rem' }} onChange={(e) => set(index, { grade: e.target.value })} />
          <Button variant="outline-danger" aria-label={t('ai.models.removeCapability')} onClick={() => onChange(draft.capabilities.filter((_, i) => i !== index))}>
            <Trash2 size={16} aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline-secondary" onClick={() => onChange([...draft.capabilities, { name: '', grade: '50' }])} className="d-inline-flex align-items-center gap-1">
        <Plus size={16} aria-hidden="true" /><span>{t('ai.models.addCapability')}</span>
      </Button>
    </div>
  );
};

/** One model for an administrator: enabled, description, prices and capabilities, saved together. */
export const ModelEditor: React.FC<{ model: AiCatalogModel; onSaved: (model: AiCatalogModel) => void }> = ({ model, onSaved }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ModelDraft>(() => draftOfModel(model));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(draftOfModel(model)); }, [model]);
  const key = `ai-model-${model.providerId}-${model.id}`;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateAiModel(model.providerId, model.id, modelInput(draft)));
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
          <h5 className="fw-bold mb-0" dir="ltr">{model.id}</h5>
          {!model.listed && <Badge bg="light" text="dark" className="border fs-6">{t('ai.models.notListed')}</Badge>}
          <Form.Check type="switch" id={`${key}-enabled`} className="ms-auto" label={t('ai.models.enabled')} checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
        </div>
        <Form.Group className="mb-3">
          <Form.Label htmlFor={`${key}-description`} className="fw-semibold">{t('ai.models.description')}</Form.Label>
          <Form.Control id={`${key}-description`} as="textarea" rows={2} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Form.Group>
        <div className="row">
          {TOKEN_KINDS.map((kind) => (
            <Form.Group key={kind} className="mb-3 col-sm-6">
              <Form.Label htmlFor={`${key}-${kind}`} className="fw-semibold">{t(`ai.models.price.${kind}`)}</Form.Label>
              <Form.Control id={`${key}-${kind}`} type="number" min={0} step="any" dir="ltr" value={draft.prices[kind]}
                onChange={(e) => setDraft({ ...draft, prices: { ...draft.prices, [kind]: e.target.value } })} />
              <Form.Text>{t('ai.models.priceHelp')}</Form.Text>
            </Form.Group>
          ))}
        </div>
        <div className="mb-3">
          <div className="fw-semibold mb-1">{t('ai.models.capabilities')}</div>
          <CapabilitiesEditor draft={draft} onChange={(capabilities) => setDraft({ ...draft, capabilities })} />
        </div>
        <details className="mb-3">
          <summary>{t('ai.models.info')}</summary>
          <ModelInfo info={model.info} />
        </details>
        {error && <Alert variant="danger" className="fs-6" dismissible onClose={() => setError(null)}>{error}</Alert>}
        <Button disabled={busy || !isChanged(draft, model)} onClick={() => void save()} className="d-inline-flex align-items-center gap-1">
          {busy ? <Spinner animation="border" size="sm" /> : <Save size={18} aria-hidden="true" />}
          <span>{t('ai.models.save')}</span>
        </Button>
      </div>
    </div>
  );
};

/** The models of one provider for an administrator: refresh from the service, add by id, and edit each. */
export const ModelsPanel: React.FC<{ providerId: string; disabled?: boolean }> = ({ providerId, disabled = false }) => {
  const { t } = useTranslation();
  const [models, setModels] = useState<AiCatalogModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState('');

  const load = () => fetchCatalogModels()
    .then((all) => setModels(all.filter((m) => m.providerId === providerId)))
    .catch((err) => setError(describeError(err, t)));
  useEffect(() => { void load(); }, [providerId]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3" aria-label={t('ai.models.title')}>
      <h5 className="fw-bold">{t('ai.models.title')}</h5>
      <p className="text-secondary">{t('ai.models.intro')}</p>
      <div className="d-flex gap-2 flex-wrap mb-3">
        <Button variant="outline-secondary" disabled={busy || disabled} onClick={() => void act(() => refreshAiModels(providerId))} className="d-flex align-items-center gap-1">
          {busy ? <Spinner animation="border" size="sm" /> : <RefreshCw size={18} aria-hidden="true" />}
          <span>{t('ai.models.refresh')}</span>
        </Button>
        <Form className="d-flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (newId.trim() !== '') void act(async () => { await addAiModel(providerId, newId.trim()); setNewId(''); });
        }}>
          <Form.Control aria-label={t('ai.models.addById')} dir="ltr" value={newId} maxLength={200} placeholder={t('ai.models.addById')} onChange={(e) => setNewId(e.target.value)} />
          <Button type="submit" variant="outline-primary" disabled={busy || newId.trim() === ''} className="d-flex align-items-center gap-1 flex-shrink-0">
            <Plus size={18} aria-hidden="true" /><span>{t('ai.models.add')}</span>
          </Button>
        </Form>
      </div>
      {error && <Alert variant="danger" className="fs-6" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {models === null && !error && <Spinner animation="border" size="sm" />}
      {models?.length === 0 && <p className="text-secondary">{t('ai.models.empty')}</p>}
      <div className="d-flex flex-column gap-2">
        {models?.map((m) => (
          <ModelEditor key={m.id} model={m} onSaved={(saved) => setModels((list) => list && list.map((x) => (x.id === saved.id ? saved : x)))} />
        ))}
      </div>
    </section>
  );
};
