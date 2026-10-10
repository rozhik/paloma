import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { i18n, initI18n } from '../i18n/index.js';
import { DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from '../settings/uiSettings.js';
import { createPin } from '../levels/pin.js';
import { SettingsView } from './SettingsView.js';

/** Sets UI settings for a server render: zustand renders its initial state there, so that is changed too. */
function setSettings(patch: Partial<UiSettings>) {
  useUiSettings.setState(patch);
  Object.assign(useUiSettings.getInitialState(), patch);
}

const render = (level: UiSettings['level']) => {
  setSettings({ level, pin: level === 'child' ? createPin('2580') : null });
  return renderToStaticMarkup(<SettingsView />);
};

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => setSettings({ level: DEFAULT_UI_SETTINGS.level, pin: null }));

describe('Settings view', () => {
  it('has the Plugins section last from Normal up', () => {
    for (const level of ['normal', 'pro', 'developer'] as const) {
      const markup = render(level);
      const plugins = markup.indexOf(i18n.t('plugins.title'));
      expect(plugins, level).toBeGreaterThan(-1);
      // After every other section
      for (const key of ['settings.language', 'settings.level', 'settings.appearance', 'settings.viewer', 'settings.editBar'] as const) {
        expect(markup.indexOf(i18n.t(key)), key).toBeLessThan(plugins);
      }
    }
  });

  it('has no Plugins section at Easy or Child', () => {
    for (const level of ['child', 'easy'] as const) expect(render(level), level).not.toContain(i18n.t('plugins.title'));
  });

  it('keeps Language first and Level second', () => {
    const markup = render('normal');
    expect(markup.indexOf(i18n.t('settings.language'))).toBeLessThan(markup.indexOf(i18n.t('settings.level')));
    expect(markup.indexOf(i18n.t('settings.level'))).toBeLessThan(markup.indexOf(i18n.t('settings.appearance')));
  });
});
