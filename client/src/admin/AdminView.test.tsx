import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PluginInfo } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { AdminView, providersOf } from './AdminView.js';

beforeAll(async () => {
  await initI18n('en');
});

const plugin = (id: string, authProviders: PluginInfo['authProviders']): PluginInfo => ({
  id, name: `Plugin ${id}`, description: '', version: '1.0.0', source: 'bundled', level: 'normal', enabled: true, status: 'active',
  error: null, warnings: [], filters: [], authProviders, aiProviders: [],
});

describe('AdminView', () => {
  it('has the Users, Roles, Sessions and tokens, and Authentication sections, starting with Users', () => {
    const markup = renderToStaticMarkup(<AdminView />);
    for (const key of ['users', 'roles', 'sessions', 'auth'] as const) expect(markup, key).toContain(i18n.t(`admin.sections.${key}`));
    expect(markup.indexOf(i18n.t('admin.sections.users'))).toBeLessThan(markup.indexOf(i18n.t('admin.sections.roles')));
    expect(markup).toContain(i18n.t('admin.users.add'));
  });
});

describe('providersOf', () => {
  it('lists the auth providers of every plugin with the plugin name', () => {
    const providers = providersOf([
      plugin('auth-password', [{ id: 'password', kind: 'credentials', label: 'Password', fields: [] }]),
      plugin('basic-effects', []),
      plugin('auth-token', [{ id: 'token', kind: 'bearer', label: 'API token', fields: [] }]),
    ]);
    expect(providers.map((p) => [p.label, p.kind, p.plugin])).toEqual([
      ['Password', 'credentials', 'Plugin auth-password'], ['API token', 'bearer', 'Plugin auth-token'],
    ]);
  });
});
