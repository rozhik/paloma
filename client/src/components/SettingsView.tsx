import React, { useState } from 'react';
import { Alert, Form } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { KeyRound, Settings } from 'lucide-react';
import {
  EDGES, SLIDESHOW_FITS, SLIDESHOW_INTERVALS, THEME_CHOICES, useUiSettings, type Edge, type ThemeChoice, type UiSettings,
} from '../settings/uiSettings.js';
import { EFFECT_DURATIONS, SLIDESHOW_EFFECTS, type EffectChoice } from './slideshow/effects.js';
import { ZOOM_LEVELS } from './viewer/zoomMath.js';
import { SKIN_IDS, type SkinId } from '../appearance/skins/ids.js';
import { THEMES } from '../appearance/themes/index.js';
import { LANGUAGES } from '../i18n/languages.js';
import { changeLanguage, currentLanguage } from '../i18n/index.js';
import { LEVELS, type Level } from '../levels/levels.js';
import { keepSettingsUnlocked } from '../levels/pinGate.js';
import { PinDialog, type PinDialogMode } from '../levels/PinDialog.js';
import type { PinRecord } from '../levels/pin.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { KeyboardSection } from '../keys/KeyboardSection.js';

/** Every UI language by its own name, as large choices; the same choice as the top bar's switcher. */
const LanguageSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const active = currentLanguage();
  return (
    <fieldset className="mb-4">
      <legend className="fs-3 fw-bold mb-1">{t('settings.language')}</legend>
      <p className="fs-5 text-secondary mb-2">{t('settings.languageHint')}</p>
      <div className="settings-language-grid" key={i18n.language}>
        {LANGUAGES.map(({ tag, nativeName, dir }) => (
          <div key={tag}>
            <input
              type="radio"
              className="btn-check"
              name="language"
              id={`language-${tag}`}
              checked={tag === active}
              onChange={() => changeLanguage(tag)}
            />
            <label className="btn btn-outline-primary w-100 fs-5" htmlFor={`language-${tag}`} lang={tag} dir={dir}>
              {nativeName}
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
};

/**
 * The five levels as large choices. Choosing Child first sets a PIN; leaving Child drops it. At Child the PIN
 * can be changed here.
 */
const LevelSection: React.FC = () => {
  const { t } = useTranslation();
  const level = useUiSettings((state) => state.level);
  const update = useUiSettings((state) => state.update);
  const [dialog, setDialog] = useState<PinDialogMode | null>(null);
  const [pinChanged, setPinChanged] = useState(false);

  const choose = (next: Level) => {
    setPinChanged(false);
    if (next === level) return;
    if (next === 'child') setDialog('create');
    else update({ level: next, pin: null });
  };

  const pinSet = (pin: PinRecord | undefined) => {
    if (!pin) return;
    if (dialog === 'create') {
      // The user who just set the PIN stays in Settings
      keepSettingsUnlocked();
      usePalomaStore.getState().enterChildMode();
      update({ level: 'child', pin });
    } else {
      update({ pin });
      setPinChanged(true);
    }
    setDialog(null);
  };

  return (
    <fieldset className="mb-4">
      <legend className="fs-3 fw-bold mb-1">{t('settings.level')}</legend>
      <p className="fs-5 text-secondary mb-2">{t('settings.levelHint')}</p>
      <div className="settings-appearance-grid">
        {LEVELS.map((option) => {
          const id = `level-${option}`;
          return (
            <div key={option}>
              <input
                type="radio"
                className="btn-check"
                name="level"
                id={id}
                checked={level === option}
                onChange={() => choose(option)}
                aria-describedby={`${id}-description`}
              />
              <label className="btn btn-outline-primary settings-appearance d-block text-start h-100" htmlFor={id}>
                <span className="d-block fs-5 fw-semibold">{t(`levels.${option}.name`)}</span>
                <span id={`${id}-description`} className="d-block settings-appearance-description">{t(`levels.${option}.description`)}</span>
              </label>
            </div>
          );
        })}
      </div>
      {level === 'child' && (
        <button type="button" className="btn btn-outline-primary btn-lg-custom mt-3" onClick={() => { setPinChanged(false); setDialog('change'); }}>
          <KeyRound size={20} />
          <span>{t('settings.changePin')}</span>
        </button>
      )}
      {pinChanged && <Alert variant="success" className="mt-3 mb-0" role="status">{t('settings.pinChanged')}</Alert>}
      <PinDialog show={dialog !== null} mode={dialog ?? 'create'} onDone={pinSet} onCancel={() => setDialog(null)} />
    </fieldset>
  );
};

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

/** Settings with a few plain choices, each a large button. */
type ChoiceSetting = 'viewerOpenZoom' | 'slideshowInterval' | 'slideshowEffectDuration' | 'slideshowFit';

/** One setting: a row of large choices, each with its name. */
function OptionChoice<T extends UiSettings[ChoiceSetting]>({ setting, label, hint, options, nameOf }: {
  setting: ChoiceSetting;
  label: string;
  hint?: string;
  options: readonly T[];
  nameOf: (option: T) => string;
}) {
  const value = useUiSettings((state) => state[setting]);
  const update = useUiSettings((state) => state.update);
  return (
    <fieldset className="mb-4">
      <legend className="fs-4 fw-semibold mb-1">{label}</legend>
      {hint && <p className="fs-5 text-secondary mb-2">{hint}</p>}
      <div className="d-flex flex-wrap gap-2">
        {options.map((option) => {
          const id = `${setting}-${option}`;
          return (
            <div key={String(option)}>
              <input
                type="radio"
                className="btn-check"
                name={setting}
                id={id}
                checked={value === option}
                onChange={() => update({ [setting]: option })}
              />
              <label className="btn btn-outline-primary fs-5" htmlFor={id}>{nameOf(option)}</label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The effects in groups, as the effect list shows them. */
const EFFECT_GROUPS: { group: 'basic' | 'fades' | 'slides' | 'pushes' | 'wipes' | 'other'; effects: EffectChoice[] }[] = [
  { group: 'basic', effects: ['none', 'random'] },
  { group: 'fades', effects: ['fade', 'dipBlack', 'dipWhite'] },
  { group: 'slides', effects: SLIDESHOW_EFFECTS.filter((effect) => effect.startsWith('slide')) },
  { group: 'pushes', effects: SLIDESHOW_EFFECTS.filter((effect) => effect.startsWith('push')) },
  { group: 'wipes', effects: SLIDESHOW_EFFECTS.filter((effect) => effect.startsWith('wipe')) },
  { group: 'other', effects: ['zoomIn', 'zoomOut', 'iris', 'blinds', 'flip'] },
];

/** How the slideshow plays: time per photo, effect, shuffle and photo size. Remembered in this browser. */
const SlideshowSection: React.FC = () => {
  const { t } = useTranslation();
  const effect = useUiSettings((state) => state.slideshowEffect);
  const shuffle = useUiSettings((state) => state.slideshowShuffle);
  const update = useUiSettings((state) => state.update);
  return (
    <section aria-labelledby="settings-slideshow">
      <h3 id="settings-slideshow" className="fs-3 fw-bold mt-4 mb-1">{t('settings.slideshow')}</h3>
      <p className="fs-5 text-secondary mb-3">{t('settings.slideshowHint')}</p>
      <OptionChoice
        setting="slideshowInterval"
        label={t('settings.slideshowInterval')}
        options={SLIDESHOW_INTERVALS}
        nameOf={(seconds) => t('slideshow.seconds', { seconds })}
      />
      <div className="mb-4">
        <label htmlFor="settings-slideshow-effect" className="fs-4 fw-semibold mb-1 d-block">{t('settings.slideshowEffect')}</label>
        <p id="settings-slideshow-effect-hint" className="fs-5 text-secondary mb-2">{t('settings.slideshowEffectHint')}</p>
        <Form.Select
          id="settings-slideshow-effect"
          size="lg"
          style={{ maxWidth: '22rem' }}
          aria-describedby="settings-slideshow-effect-hint"
          value={effect}
          onChange={(event) => update({ slideshowEffect: event.target.value as EffectChoice })}
        >
          {EFFECT_GROUPS.map(({ group, effects }) => (
            <optgroup key={group} label={t(`settings.effectGroups.${group}`)}>
              {effects.map((option) => <option key={option} value={option}>{t(`settings.effects.${option}`)}</option>)}
            </optgroup>
          ))}
        </Form.Select>
      </div>
      <OptionChoice
        setting="slideshowEffectDuration"
        label={t('settings.slideshowEffectDuration')}
        options={EFFECT_DURATIONS}
        nameOf={(seconds) => t('slideshow.seconds', { seconds })}
      />
      <div className="mb-4">
        <Form.Check
          type="switch"
          id="settings-slideshow-shuffle"
          className="fs-4 fw-semibold"
          label={t('settings.slideshowShuffle')}
          checked={shuffle}
          aria-describedby="settings-slideshow-shuffle-hint"
          onChange={(event) => update({ slideshowShuffle: event.target.checked })}
        />
        <p id="settings-slideshow-shuffle-hint" className="fs-5 text-secondary mb-0">{t('settings.slideshowShuffleHint')}</p>
      </div>
      <OptionChoice
        setting="slideshowFit"
        label={t('settings.slideshowFit')}
        options={SLIDESHOW_FITS}
        nameOf={(fit) => t(`settings.slideshowFits.${fit}`)}
      />
    </section>
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

/**
 * Settings view: what is remembered in this browser, and the user's keymap, which is kept on the server. The account,
 * administration and server settings are in the user menu.
 */
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

        <LanguageSection />
        <LevelSection />

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
        <OptionChoice
          setting="viewerOpenZoom"
          label={t('settings.openZoom')}
          hint={t('settings.openZoomHint')}
          options={ZOOM_LEVELS}
          nameOf={(level) => t(`settings.zoomLevels.${level}`)}
        />

        <SlideshowSection />

        <KeyboardSection />
      </div>
    </main>
  );
};
