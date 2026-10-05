import React, { useEffect, useState } from 'react';
import { Alert, Badge, Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Puzzle, ShieldAlert } from 'lucide-react';
import type { PluginInfo } from '../../../shared/types.js';
import { fetchPlugins, setPluginEnabled } from '../api/plugins.js';
import { describeError } from '../api/http.js';
import { currentLanguage } from '../i18n/index.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** Plugins view: every plugin found at startup, with a switch to turn it on or off. */
export const PluginsView: React.FC = () => {
  const { bumpLibrary } = usePalomaStore();
  const { t, i18n } = useTranslation();
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlugins(currentLanguage())
      .then((list) => { if (!cancelled) setPlugins(list); })
      .catch((err) => { if (!cancelled) setError(describeError(err, t)); });
    return () => { cancelled = true; };
  }, [i18n.language]);

  // The switch shows the server's state: it changes only after the server confirms
  const toggle = async (plugin: PluginInfo) => {
    setSwitching(plugin.id);
    setError(null);
    try {
      const updated = await setPluginEnabled(plugin.id, !plugin.enabled, currentLanguage());
      setPlugins((list) => list?.map((p) => (p.id === updated.id ? updated : p)) ?? null);
      // Photos that use the plugin's filters look different now
      bumpLibrary();
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <main className="flex-grow-1 bg-light overflow-auto p-4" style={{ marginBottom: '80px' }}>
      <div className="mx-auto" style={{ maxWidth: '900px' }}>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-2">
          <Puzzle size={30} />
          <span>{t('plugins.title')}</span>
        </h2>
        <p className="fs-5 text-secondary">{t('plugins.intro')}</p>

        <Alert variant="warning" className="d-flex align-items-start gap-2 fs-5">
          <ShieldAlert size={26} className="flex-shrink-0" />
          <span>{t('plugins.externalWarning')}</span>
        </Alert>

        {error && <Alert variant="danger" className="fs-5" onClose={() => setError(null)} dismissible>{error}</Alert>}

        {plugins === null && !error && (
          <div className="d-flex align-items-center gap-2 fs-5 text-secondary">
            <Spinner animation="border" size="sm" />
            <span>{t('plugins.loading')}</span>
          </div>
        )}

        {plugins?.length === 0 && <p className="fs-5">{t('plugins.empty')}</p>}

        <div className="d-flex flex-column gap-3">
          {plugins?.map((plugin) => (
            <div key={plugin.id} className="card shadow-sm">
              <div className="card-body d-flex align-items-start gap-3">
                <div className="flex-grow-1">
                  <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
                    <h4 className="fw-bold mb-0">{plugin.name}</h4>
                    <Badge bg={plugin.source === 'bundled' ? 'secondary' : 'info'} className="fs-6">
                      {plugin.source === 'bundled' ? t('plugins.bundled') : t('plugins.external')}
                    </Badge>
                    {plugin.version && <span className="text-secondary">{t('plugins.version', { version: plugin.version })}</span>}
                  </div>
                  {plugin.description && <p className="fs-5 mb-2">{plugin.description}</p>}
                  {plugin.filters.length > 0 && (
                    <p className="text-secondary mb-0">
                      {t('plugins.filters', { list: plugin.filters.map((f) => f.label).join(', ') })}
                    </p>
                  )}
                  {plugin.error && (
                    <Alert variant="danger" className="mt-2 mb-0">
                      <strong>{t('plugins.loadError')}</strong>{' '}
                      <span dir="ltr">{plugin.error}</span>
                    </Alert>
                  )}
                  {plugin.warnings.map((warning) => (
                    <div key={warning} className="text-warning-emphasis d-flex align-items-start gap-1 mt-2">
                      <AlertTriangle size={18} className="flex-shrink-0 mt-1" />
                      <span><strong>{t('plugins.warning')}</strong> <span dir="ltr">{warning}</span></span>
                    </div>
                  ))}
                </div>

                <div className="d-flex flex-column align-items-center gap-1 flex-shrink-0">
                  {switching === plugin.id ? <Spinner animation="border" /> : (
                    <Form.Check
                      type="switch"
                      id={`plugin-${plugin.id}`}
                      className="plugin-switch"
                      checked={plugin.enabled}
                      // A plugin in error that is off cannot be used at all (manifest, id or API version)
                      disabled={switching !== null || (plugin.status === 'error' && !plugin.enabled)}
                      onChange={() => toggle(plugin)}
                      aria-label={t('plugins.switchLabel', { name: plugin.name })}
                    />
                  )}
                  <span className="fw-semibold">{plugin.enabled ? t('plugins.on') : t('plugins.off')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-secondary mt-4">{t('plugins.installHint')}</p>
      </div>
    </main>
  );
};
