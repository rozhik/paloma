import React, { useState } from 'react';
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Pencil, Plus, PlugZap, Save, ShieldAlert, Trash2 } from 'lucide-react';
import type { AiProviderInfo, AiProviderSummary, AiSettingInfo } from '../../../shared/types.js';
import { createAiProvider, deleteAiProvider, renameAiProvider, saveAiProviderSettings, testAiProvider } from '../api/ai.js';
import { describeError } from '../api/http.js';
import { currentLanguage } from '../i18n/index.js';
import { providerAddress } from './aiText.js';
import { ModelsPanel } from './ModelsPanel.js';

type Draft = Record<string, string | number | boolean | null>;

/** What a setting's field shows before the user changes it. */
function initialValue(setting: AiSettingInfo): string | number | boolean {
  if (setting.type === 'secret') return '';
  if (setting.value !== null) return setting.value;
  if (setting.type === 'boolean') return setting.default === true;
  return '';
}

/** The values to save: every changed field; a secret only when something was typed or it is being removed. */
export function changedValues(provider: AiProviderInfo, draft: Draft): Draft {
  const values: Draft = {};
  for (const setting of provider.settings) {
    if (!(setting.name in draft)) continue;
    const value = draft[setting.name];
    if (setting.type === 'secret') {
      if (value !== '') values[setting.name] = value;
      continue;
    }
    if (setting.type === 'number') {
      values[setting.name] = value === '' || value === null ? null : Number(value);
      continue;
    }
    values[setting.name] = value === '' ? null : value;
  }
  return values;
}

const SettingField: React.FC<{
  providerId: string;
  setting: AiSettingInfo;
  value: string | number | boolean | null;
  onChange: (value: string | number | boolean | null) => void;
}> = ({ providerId, setting, value, onChange }) => {
  const { t } = useTranslation();
  const id = `ai-${providerId}-${setting.name}`;
  const help = [setting.help, setting.fromEnv ? t('ai.providers.fromEnv') : null].filter(Boolean).join(' ');
  let control: React.ReactNode;
  switch (setting.type) {
    case 'boolean':
      control = <Form.Check type="switch" id={id} checked={value === true} onChange={(e) => onChange(e.target.checked)} label={setting.label} />;
      break;
    case 'choice':
      control = (
        <Form.Select id={id} value={String(value ?? setting.default ?? '')} onChange={(e) => {
          const option = setting.options?.find((o) => String(o.value) === e.target.value);
          onChange(option ? option.value : null);
        }}>
          {setting.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
        </Form.Select>
      );
      break;
    case 'secret':
      control = (
        <div className="d-flex gap-2 align-items-center">
          <Form.Control
            id={id}
            type="password"
            autoComplete="off"
            value={value === null ? '' : String(value)}
            placeholder={value === null ? t('ai.providers.secretRemoved') : setting.set ? t('ai.providers.secretSet') : t('ai.providers.secretNotSet')}
            onChange={(e) => onChange(e.target.value)}
          />
          {setting.set && value !== null && (
            <Button variant="outline-danger" onClick={() => onChange(null)}>{t('ai.providers.remove')}</Button>
          )}
        </div>
      );
      break;
    default:
      control = (
        <Form.Control
          id={id}
          type={setting.type === 'number' ? 'number' : 'text'}
          dir="ltr"
          min={setting.min}
          max={setting.max}
          value={value === null ? '' : String(value)}
          placeholder={setting.default !== undefined ? String(setting.default) : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <Form.Group className="mb-3">
      {setting.type !== 'boolean' && (
        <Form.Label htmlFor={id} className="fw-semibold">
          {setting.label}{setting.required && <span aria-hidden="true"> *</span>}
        </Form.Label>
      )}
      {control}
      {help && <Form.Text>{help}</Form.Text>}
    </Form.Group>
  );
};

/** The name of a provider with Rename and Delete; a rename or delete the server refuses shows its message. */
const ProviderTitle: React.FC<{ provider: AiProviderInfo; onChanged: () => void }> = ({ provider, onChanged }) => {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(provider.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, done: () => void) => {
    setError(null);
    try {
      await action();
      done();
      onChanged();
    } catch (err) {
      setError(describeError(err, t));
    }
  };

  return (
    <>
      <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
        {renaming ? (
          <Form className="d-flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => renameAiProvider(provider.id, name, currentLanguage()), () => setRenaming(false)); }}>
            <Form.Control aria-label={t('ai.providers.name')} value={name} maxLength={60} required autoFocus onChange={(e) => setName(e.target.value)} />
            <Button type="submit">{t('ai.providers.rename')}</Button>
            <Button variant="outline-secondary" onClick={() => { setRenaming(false); setName(provider.name); setError(null); }}>{t('ai.providers.cancel')}</Button>
          </Form>
        ) : <h4 className="fw-bold mb-0">{provider.name}</h4>}
        <Badge bg={provider.available && provider.status === 'configured' ? 'success' : 'warning'} text={provider.available && provider.status === 'configured' ? undefined : 'dark'} className="fs-6">
          {!provider.available ? t('ai.providers.unavailable') : provider.status === 'configured' ? t('ai.providers.configured') : t('ai.providers.notConfigured')}
        </Badge>
        <span className="text-secondary">
          {provider.available ? t('ai.providers.typePlugin', { type: provider.label, plugin: provider.pluginId }) : t('ai.providers.typeOnly', { type: provider.type })}
        </span>
        {!renaming && (
          <span className="ms-auto d-flex gap-2">
            <Button variant="outline-secondary" size="sm" onClick={() => setRenaming(true)} className="d-flex align-items-center gap-1">
              <Pencil size={16} aria-hidden="true" /><span>{t('ai.providers.rename')}</span>
            </Button>
            <Button variant="outline-danger" size="sm" onClick={() => setConfirmDelete(true)} className="d-flex align-items-center gap-1">
              <Trash2 size={16} aria-hidden="true" /><span>{t('ai.providers.delete')}</span>
            </Button>
          </span>
        )}
      </div>
      {confirmDelete && (
        <Alert variant="warning" className="fs-6">
          <p className="mb-2">{t('ai.providers.deleteBody', { name: provider.name })}</p>
          <div className="d-flex gap-2">
            <Button variant="danger" size="sm" onClick={() => void run(() => deleteAiProvider(provider.id), () => setConfirmDelete(false))}>{t('ai.providers.delete')}</Button>
            <Button variant="outline-secondary" size="sm" onClick={() => setConfirmDelete(false)}>{t('ai.providers.cancel')}</Button>
          </div>
        </Alert>
      )}
      {error && <Alert variant="danger" className="fs-6" dismissible onClose={() => setError(null)}>{error}</Alert>}
    </>
  );
};

/**
 * One provider: its name and status, where photos go, the form for its settings with Save and Test connection, and
 * its models. `onSaved` follows a change of the settings; `onChanged` a rename or delete.
 */
export const ProviderCard: React.FC<{ provider: AiProviderInfo; onSaved: (provider: AiProviderInfo) => void; onChanged?: () => void }> = ({ provider, onSaved, onChanged = () => {} }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'danger'; text: string } | null>(null);
  const address = providerAddress(provider);
  const missing = provider.missing.map((name) => provider.settings.find((s) => s.name === name)?.label ?? name);

  const valueOf = (setting: AiSettingInfo) => (setting.name in draft ? draft[setting.name] : initialValue(setting));

  const save = async () => {
    setBusy('save');
    setMessage(null);
    try {
      const saved = await saveAiProviderSettings(provider.id, changedValues(provider, draft), currentLanguage());
      setDraft({});
      onSaved(saved);
      setMessage({ variant: 'success', text: t('ai.providers.saved') });
    } catch (err) {
      setMessage({ variant: 'danger', text: describeError(err, t) });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setMessage(null);
    try {
      await testAiProvider(provider.id);
      setMessage({ variant: 'success', text: t('ai.providers.testOk') });
    } catch (err) {
      setMessage({ variant: 'danger', text: describeError(err, t) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <ProviderTitle provider={provider} onChanged={onChanged} />
        {!provider.available && <p className="text-warning-emphasis mb-2">{t('ai.providers.pluginOff')}</p>}
        {missing.length > 0 && <p className="text-warning-emphasis mb-2">{t('ai.providers.missing', { list: missing.join(', ') })}</p>}
        {provider.available && (
          <p className="d-flex align-items-start gap-2 text-secondary">
            <ShieldAlert size={20} className="flex-shrink-0 mt-1" aria-hidden="true" />
            <span>
              {address
                ? t('ai.providers.privacyAddress', { name: provider.name, address })
                : t('ai.providers.privacy', { name: provider.name })}
            </span>
          </p>
        )}
        {provider.available && (
          <Form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            {provider.settings.map((setting) => (
              <SettingField
                key={setting.name}
                providerId={provider.id}
                setting={setting}
                value={valueOf(setting)}
                onChange={(value) => setDraft((d) => ({ ...d, [setting.name]: value }))}
              />
            ))}
            {message && <Alert variant={message.variant} className="fs-6" dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}
            <div className="d-flex gap-2 flex-wrap">
              <Button type="submit" disabled={busy !== null} className="d-flex align-items-center gap-1">
                {busy === 'save' ? <Spinner animation="border" size="sm" /> : <Save size={18} aria-hidden="true" />}
                <span>{t('ai.providers.save')}</span>
              </Button>
              <Button variant="outline-secondary" disabled={busy !== null} onClick={() => void test()} className="d-flex align-items-center gap-1">
                {busy === 'test' ? <Spinner animation="border" size="sm" /> : <PlugZap size={18} aria-hidden="true" />}
                <span>{t('ai.providers.test')}</span>
              </Button>
            </div>
          </Form>
        )}
        <details className="mt-3">
          <summary className="fw-semibold fs-5">{t('ai.models.title')}</summary>
          <ModelsPanel providerId={provider.id} disabled={!provider.available || provider.status !== 'configured'} />
        </details>
      </div>
    </div>
  );
};

/** The provider types the active plugins contribute, once each. */
export const providerTypes = (summaries: AiProviderSummary[]): AiProviderSummary[] =>
  summaries.filter((s, i) => summaries.findIndex((o) => o.id === s.id) === i);

/** Adds a provider: choose a type a plugin contributes and give it a name. */
const AddProvider: React.FC<{ types: AiProviderSummary[]; onAdded: () => void }> = ({ types, onAdded }) => {
  const { t } = useTranslation();
  const [type, setType] = useState(types[0]?.id ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = types.some((x) => x.id === type) ? type : types[0]?.id ?? '';
  return (
    <Form className="card card-body shadow-sm mb-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await createAiProvider(chosen, name, currentLanguage());
        setName('');
        onAdded();
      } catch (err) {
        setError(describeError(err, t));
      } finally {
        setBusy(false);
      }
    }}>
      <h5 className="fw-bold">{t('ai.providers.addTitle')}</h5>
      <div className="d-flex gap-2 flex-wrap align-items-end">
        <Form.Group>
          <Form.Label htmlFor="ai-new-provider-type" className="fw-semibold">{t('ai.providers.type')}</Form.Label>
          <Form.Select id="ai-new-provider-type" value={chosen} onChange={(e) => setType(e.target.value)}>
            {types.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Form.Select>
        </Form.Group>
        <Form.Group className="flex-grow-1">
          <Form.Label htmlFor="ai-new-provider-name" className="fw-semibold">{t('ai.providers.name')}</Form.Label>
          <Form.Control id="ai-new-provider-name" value={name} maxLength={60} required placeholder={t('ai.providers.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </Form.Group>
        <Button type="submit" disabled={busy || name.trim() === ''} className="d-flex align-items-center gap-1">
          {busy ? <Spinner animation="border" size="sm" /> : <Plus size={18} aria-hidden="true" />}
          <span>{t('ai.providers.add')}</span>
        </Button>
      </div>
      {error && <Alert variant="danger" className="fs-6 mt-2 mb-0" dismissible onClose={() => setError(null)}>{error}</Alert>}
    </Form>
  );
};

/**
 * The providers part of the AI section: every named provider and a form to add one. Says what to do when no AI
 * plugin is on. `types` are the provider types the active plugins contribute.
 */
export const ProvidersPanel: React.FC<{
  providers: AiProviderInfo[];
  types?: AiProviderSummary[];
  onSaved: (provider: AiProviderInfo) => void;
  onChanged?: () => void;
}> = ({ providers, types = [], onSaved, onChanged = () => {} }) => {
  const { t } = useTranslation();
  return (
    <div className="mb-4">
      <h4 className="fs-4 fw-bold mb-2 d-flex align-items-center gap-2">
        <CheckCircle2 size={22} aria-hidden="true" />
        <span>{t('ai.providers.title')}</span>
      </h4>
      {types.length === 0 && <Alert variant="info" className="fs-5">{t('ai.providers.none')}</Alert>}
      {types.length > 0 && <AddProvider types={types} onAdded={onChanged} />}
      <div className="d-flex flex-column gap-3">{providers.map((p) => <ProviderCard key={p.id} provider={p} onSaved={onSaved} onChanged={onChanged} />)}</div>
    </div>
  );
};
