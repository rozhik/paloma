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
  it('has no Plugins section at any level; plugins are in Server settings', () => {
    for (const level of ['child', 'easy', 'normal', 'pro', 'developer'] as const) {
      expect(render(level), level).not.toContain(i18n.t('plugins.title'));
    }
  });

  it('keeps Language first and Level second', () => {
    const markup = render('normal');
    expect(markup.indexOf(i18n.t('settings.language'))).toBeLessThan(markup.indexOf(i18n.t('settings.level')));
    expect(markup.indexOf(i18n.t('settings.level'))).toBeLessThan(markup.indexOf(i18n.t('settings.appearance')));
  });
});
