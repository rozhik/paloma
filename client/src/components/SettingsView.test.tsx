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

describe('Keyboard section', () => {
  it('comes after the viewer bars from Normal, and is not at Easy', () => {
    const normal = render('normal');
    expect(normal.indexOf(i18n.t('settings.editBar'))).toBeLessThan(normal.indexOf(i18n.t('keys.settingsTitle')));
    expect(normal).toContain(i18n.t('keys.edit'));
    expect(render('easy')).not.toContain(i18n.t('keys.settingsTitle'));
  });

  it('offers the three presets and marks the one the keymap is based on', async () => {
    const { useKeymapStore } = await import('../keys/keymapStore.js');
    const tv = { stored: { name: 'TV box', basedOn: 'tvBox' as const, bindings: {} } };
    useKeymapStore.setState(tv);
    Object.assign(useKeymapStore.getInitialState(), tv);
    const markup = render('normal');
    for (const preset of ['mac', 'windows', 'tvBox'] as const) expect(markup).toContain(i18n.t(`keys.presets.${preset}.description`));
    expect(markup).toMatch(/aria-pressed="true"[^>]*aria-describedby="keymap-tvBox-description"/);
    expect(markup).toContain(i18n.t('keys.current', { name: 'TV box' }));
    Object.assign(useKeymapStore.getInitialState(), { stored: null });
    useKeymapStore.setState({ stored: null });
  });
});
