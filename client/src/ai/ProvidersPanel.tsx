import React, { useState } from 'react';
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, PlugZap, Save, ShieldAlert } from 'lucide-react';
import type { AiProviderInfo, AiSettingInfo } from '../../../shared/types.js';
import { saveAiProviderSettings, testAiProvider } from '../api/ai.js';
import { describeError } from '../api/http.js';
import { currentLanguage } from '../i18n/index.js';
import { providerAddress } from './aiText.js';

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

/** One provider: its status, where photos go, and the form for its settings with Save and Test connection. */
export const ProviderCard: React.FC<{ provider: AiProviderInfo; onSaved: (provider: AiProviderInfo) => void }> = ({ provider, onSaved }) => {
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
        <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
          <h4 className="fw-bold mb-0">{provider.label}</h4>
          <Badge bg={provider.status === 'configured' ? 'success' : 'warning'} text={provider.status === 'configured' ? undefined : 'dark'} className="fs-6">
            {provider.status === 'configured' ? t('ai.providers.configured') : t('ai.providers.notConfigured')}
          </Badge>
          <span className="text-secondary">{t('ai.providers.plugin', { plugin: provider.pluginId })}</span>
        </div>
        {missing.length > 0 && <p className="text-warning-emphasis mb-2">{t('ai.providers.missing', { list: missing.join(', ') })}</p>}
        <p className="d-flex align-items-start gap-2 text-secondary">
          <ShieldAlert size={20} className="flex-shrink-0 mt-1" aria-hidden="true" />
          <span>
            {address
              ? t('ai.providers.privacyAddress', { name: provider.label, address })
              : t('ai.providers.privacy', { name: provider.label })}
          </span>
        </p>
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
      </div>
    </div>
  );
};

/** The providers part of the AI section; says what to do when no AI plugin is on. */
export const ProvidersPanel: React.FC<{ providers: AiProviderInfo[]; onSaved: (provider: AiProviderInfo) => void }> = ({ providers, onSaved }) => {
  const { t } = useTranslation();
  return (
    <div className="mb-4">
      <h4 className="fs-4 fw-bold mb-2 d-flex align-items-center gap-2">
        <CheckCircle2 size={22} aria-hidden="true" />
        <span>{t('ai.providers.title')}</span>
      </h4>
      {providers.length === 0
        ? <Alert variant="info" className="fs-5">{t('ai.providers.none')}</Alert>
        : <div className="d-flex flex-column gap-3">{providers.map((p) => <ProviderCard key={p.id} provider={p} onSaved={onSaved} />)}</div>}
    </div>
  );
};
