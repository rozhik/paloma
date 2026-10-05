import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { EDGES, useUiSettings, type Edge, type UiSettings } from '../settings/uiSettings.js';

/** A small screen with a bar along `edge`, so each choice shows where the bar goes. */
const EdgePicture: React.FC<{ edge: Edge }> = ({ edge }) => {
  const horizontal = edge === 'top' || edge === 'bottom';
  return (
    <span className="settings-screen" aria-hidden="true">
      <span
        className="settings-screen-bar"
        style={{
          [edge]: 0,
          ...(horizontal ? { left: 0, right: 0, height: '22%' } : { top: 0, bottom: 0, width: '22%' }),
        }}
      />
    </span>
  );
};

/** One setting: four large choices of a screen edge. */
const EdgeChoice: React.FC<{ setting: keyof UiSettings; label: string; hint: string }> = ({ setting, label, hint }) => {
  const { t } = useTranslation();
  const value = useUiSettings((state) => state[setting]);
  const update = useUiSettings((state) => state.update);
  return (
    <fieldset className="mb-4">
      <legend className="fs-4 fw-semibold mb-1">{label}</legend>
      <p className="fs-5 text-secondary mb-2">{hint}</p>
      <div className="d-flex flex-wrap gap-3">
        {EDGES.map((edge) => {
          const id = `${setting}-${edge}`;
          return (
            <div key={edge}>
              <input
                type="radio"
                className="btn-check"
                name={setting}
                id={id}
                checked={value === edge}
                onChange={() => update({ [setting]: edge })}
              />
              <label className="btn btn-outline-primary settings-edge d-flex flex-column align-items-center gap-2 fs-5" htmlFor={id}>
                <EdgePicture edge={edge} />
                <span>{t(`settings.edges.${edge}`)}</span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
};

/** Settings view: UI preferences remembered in this browser. */
export const SettingsView: React.FC = () => {
  const { t } = useTranslation();
  return (
    <main className="flex-grow-1 bg-light overflow-auto p-4" style={{ marginBottom: '80px' }}>
      <div className="mx-auto" style={{ maxWidth: '900px' }}>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-2">
          <Settings size={30} />
          <span>{t('settings.title')}</span>
        </h2>
        <p className="fs-5 text-secondary">{t('settings.intro')}</p>

        <h3 className="fs-3 fw-bold mt-4 mb-3">{t('settings.viewer')}</h3>
        <EdgeChoice setting="navBar" label={t('settings.navBar')} hint={t('settings.navBarHint')} />
        <EdgeChoice setting="editBar" label={t('settings.editBar')} hint={t('settings.editBarHint')} />
      </div>
    </main>
  );
};
