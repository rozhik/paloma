import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { EDGES, THEME_CHOICES, useUiSettings, type Edge, type ThemeChoice, type UiSettings } from '../settings/uiSettings.js';
import { SKIN_IDS, type SkinId } from '../appearance/skins/ids.js';
import { THEMES } from '../appearance/themes/index.js';

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

/** A small screen sketched in the skin's arrangement: bars, sidebar and floating glass. */
const SkinPicture: React.FC<{ skin: SkinId }> = ({ skin }) => (
  <span className={`settings-screen settings-skin settings-skin-${skin}`} aria-hidden="true">
    <span className="settings-skin-top" />
    <span className="settings-skin-side" />
    <span className="settings-skin-bottom" />
  </span>
);

/** A small screen in the theme's colors; System shows Light and Dark side by side. */
const ThemePicture: React.FC<{ theme: ThemeChoice }> = ({ theme }) => {
  const halves = theme === 'system' ? [THEMES.light, THEMES.dark] : [THEMES[theme]];
  return (
    <span className="settings-screen settings-theme d-flex" aria-hidden="true">
      {halves.map(({ id, colors }) => (
        // The picture shows the theme's own colors, whatever theme is active
        <span key={id} className="settings-theme-half" style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}>
          <span className="settings-theme-bar" style={{ background: colors['chrome-bg'] }} />
          <span className="settings-theme-text">Aa</span>
          <span className="settings-theme-accent" style={{ background: colors.accent }} />
        </span>
      ))}
    </span>
  );
};

/** One appearance setting: large choices, each with a picture, a name and a description. */
function AppearanceChoice<T extends string>({ setting, label, hint, options, picture, nameOf, describe }: {
  setting: 'skin' | 'theme';
  label: string;
  hint: string;
  options: readonly T[];
  picture: (option: T) => React.ReactNode;
  nameOf: (option: T) => string;
  describe: (option: T) => string;
}) {
  const value = useUiSettings((state) => state[setting]);
  const update = useUiSettings((state) => state.update);
  return (
    <fieldset className="mb-4">
      <legend className="fs-4 fw-semibold mb-1">{label}</legend>
      <p className="fs-5 text-secondary mb-2">{hint}</p>
      <div className="settings-appearance-grid">
        {options.map((option) => {
          const id = `${setting}-${option}`;
          return (
            <div key={option}>
              <input
                type="radio"
                className="btn-check"
                name={setting}
                id={id}
                checked={value === option}
                onChange={() => update({ [setting]: option })}
                aria-describedby={`${id}-description`}
              />
              <label className="btn btn-outline-primary settings-appearance d-flex align-items-start gap-3 text-start h-100" htmlFor={id}>
                {picture(option)}
                <span>
                  <span className="d-block fs-5 fw-semibold">{nameOf(option)}</span>
                  <span id={`${id}-description`} className="d-block settings-appearance-description">{describe(option)}</span>
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Settings view: UI preferences remembered in this browser. */
export const SettingsView: React.FC = () => {
  const { t } = useTranslation();
  return (
    <main className="flex-grow-1 pal-page overflow-auto p-4">
      <div className="mx-auto" style={{ maxWidth: '900px' }}>
        <h2 className="fw-bold d-flex align-items-center gap-2 mb-2">
          <Settings size={30} />
          <span>{t('settings.title')}</span>
        </h2>
        <p className="fs-5 text-secondary">{t('settings.intro')}</p>

        <h3 className="fs-3 fw-bold mt-4 mb-3">{t('settings.appearance')}</h3>
        <AppearanceChoice
          setting="skin"
          label={t('settings.skin')}
          hint={t('settings.skinHint')}
          options={SKIN_IDS}
          picture={(skin) => <SkinPicture skin={skin} />}
          nameOf={(skin) => t(`settings.skins.${skin}.name`)}
          describe={(skin) => t(`settings.skins.${skin}.description`)}
        />
        <AppearanceChoice
          setting="theme"
          label={t('settings.theme')}
          hint={t('settings.themeHint')}
          options={THEME_CHOICES}
          picture={(theme) => <ThemePicture theme={theme} />}
          nameOf={(theme) => t(`settings.themes.${theme}.name`)}
          describe={(theme) => t(`settings.themes.${theme}.description`)}
        />

        <h3 className="fs-3 fw-bold mt-4 mb-3">{t('settings.viewer')}</h3>
        <EdgeChoice setting="navBar" label={t('settings.navBar')} hint={t('settings.navBarHint')} />
        <EdgeChoice setting="editBar" label={t('settings.editBar')} hint={t('settings.editBarHint')} />
      </div>
    </main>
  );
};
