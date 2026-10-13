import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { KEY_ACTIONS } from '../../../shared/keymaps.js';
import { i18n, initI18n } from '../i18n/index.js';
import { DEFAULT_UI_SETTINGS, useUiSettings, type UiSettings } from '../settings/uiSettings.js';
import { useKeymapStore } from './keymapStore.js';
import { KeybindingsView } from './KeybindingsView.js';
import { actionName } from './names.js';

function setState<T extends object>(store: { setState: (p: Partial<T>) => void; getInitialState: () => T }, patch: Partial<T>) {
  store.setState(patch);
  Object.assign(store.getInitialState(), patch);
}

const render = (level: UiSettings['level']) => {
  setState(useUiSettings, { level });
  return renderToStaticMarkup(<KeybindingsView />);
};

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => {
  setState(useUiSettings, { level: DEFAULT_UI_SETTINGS.level });
  setState(useKeymapStore, { stored: null, filters: [] });
});

describe('Keybindings page', () => {
  it('lists every section with every action by name', () => {
    const markup = render('normal');
    for (const section of ['global', 'library', 'selection', 'viewer', 'edit', 'slideshow', 'people', 'map', 'collage'] as const) {
      expect(markup).toContain(i18n.t(`keys.sections.${section}`));
    }
    for (const action of KEY_ACTIONS) expect(markup, action.id).toContain(actionName(i18n.t, action.id).replace('&', '&amp;'));
  });

  it('shows each action\'s keys from the user\'s keymap', () => {
    setState(useKeymapStore, { stored: { name: 'Mine', basedOn: 'windows', bindings: { 'viewer.next': ['N'], 'selection.star': [] } } });
    const markup = render('normal');
    expect(markup).toContain('value="Mine"');
    expect(markup).toContain(i18n.t('keys.removeKey', { key: 'N' }));
    expect(markup).toContain(i18n.t('keys.noKey'));
    // Changed actions can be reset
    expect(markup).toContain(i18n.t('keys.resetActionLabel', { action: i18n.t('keys.actions.viewer.next') }));
  });

  it('lists the filters of installed plugins under Edit', () => {
    setState(useKeymapStore, { filters: [{ id: 'edit.vignette.vignette', label: 'Vignette' }] });
    expect(render('normal')).toContain('Vignette');
  });

  it('offers Download and Upload from Professional', () => {
    const button = (key: 'keys.download' | 'keys.upload') => `<span>${i18n.t(key)}</span>`;
    expect(render('normal')).not.toContain(button('keys.download'));
    expect(render('normal')).not.toContain(button('keys.upload'));
    expect(render('pro')).toContain(button('keys.download'));
    expect(render('pro')).toContain(button('keys.upload'));
  });
});
