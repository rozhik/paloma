import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MeResponse, Permission } from '../../../shared/types.js';
import { i18n, initI18n } from '../i18n/index.js';
import { useUiSettings } from '../settings/uiSettings.js';
import { AccountView, AvatarSection, ExportUsage, usageState } from './AccountView.js';
import { useAuthStore } from './authStore.js';
import { fileSizeText } from '../components/viewer/infoFormat.js';
import { SettingsView } from '../components/SettingsView.js';

const MB = 1024 * 1024;
const me = (roleName: string, permissions: Permission[]): MeResponse => ({
  mode: 'on', via: 'session',
  user: { id: 'u1', username: 'ben', displayName: 'Ben', roleId: 'viewer', roleName, mustChangePassword: false, personId: null, personName: null, personVisible: false, avatarUrl: null },
  permissions, access: { all: true },
  quotas: [{ kind: 'export_bytes', limit: 500 * MB, effectiveLimit: 500 * MB, used: 450 * MB }],
});

/** Sets the auth state for a server render: zustand renders its initial state there, so that is changed too. */
function setAuth(patch: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState(patch);
  Object.assign(useAuthStore.getInitialState(), patch);
}

function setLevel(level: 'normal' | 'easy') {
  useUiSettings.setState({ level });
  Object.assign(useUiSettings.getInitialState(), { level });
}

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  setLevel('normal');
});

describe('usageState', () => {
  it('marks a quota nearly full from 90 % and full at the limit', () => {
    expect(usageState({ effectiveLimit: 100, used: 89 })).toBe('ok');
    expect(usageState({ effectiveLimit: 100, used: 90 })).toBe('nearly');
    expect(usageState({ effectiveLimit: 100, used: 100 })).toBe('full');
    expect(usageState({ effectiveLimit: null, used: 1e12 })).toBe('ok');
  });

  it('shows the usage of the limit, marked as nearly full', () => {
    const markup = renderToStaticMarkup(<ExportUsage quota={me('Viewer', []).quotas[0]} />);
    expect(markup).toContain(`${fileSizeText(450 * MB, 'en')} of ${fileSizeText(500 * MB, 'en')}`);
    expect(markup).toContain(i18n.t('account.nearlyFull'));
  });
});

describe('AccountView', () => {
  it('shows a viewer their name, role, password form and Log out, without tokens', () => {
    setAuth({ phase: 'ready', me: me('Viewer', ['library.view']) });
    const markup = renderToStaticMarkup(<AccountView />);
    expect(markup).toContain('ben');
    expect(markup).toContain('Viewer');
    expect(markup).toContain(i18n.t('auth.logout'));
    expect(markup).toContain(i18n.t('account.changePassword'));
    expect(markup).toContain(i18n.t('account.sessions'));
    expect(markup).not.toContain(i18n.t('account.createToken'));
  });

  it('lists tokens for a user with account.tokens from the Normal level', () => {
    setAuth({ phase: 'ready', me: me('Editor', ['library.view', 'account.tokens']) });
    expect(renderToStaticMarkup(<AccountView />)).toContain(i18n.t('account.createToken'));
    setLevel('easy');
    expect(renderToStaticMarkup(<AccountView />)).not.toContain(i18n.t('account.createToken'));
  });
});

describe('AvatarSection', () => {
  it('offers Upload, and Remove only for an uploaded picture, and names the linked person', () => {
    const value = me('Viewer', ['library.view']);
    const without = renderToStaticMarkup(<AvatarSection me={value} />);
    expect(without).toContain(i18n.t('account.uploadAvatar'));
    expect(without).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(without).not.toContain(i18n.t('account.removeAvatar'));
    expect(without).toContain(i18n.t('account.noPerson'));

    const linked = { ...value, user: { ...value.user!, avatarUrl: '/api/users/u1/avatar?v=1', personId: 'aaaaaaaaaaaaaaaa', personName: 'Ben Avery' } };
    const markup = renderToStaticMarkup(<AvatarSection me={linked} />);
    expect(markup).toContain(i18n.t('account.removeAvatar'));
    expect(markup).toContain('src="/api/users/u1/avatar?v=1"');
    expect(markup).toContain(i18n.t('account.person', { name: 'Ben Avery' }));

    // The person's face is shown, but there is nothing of the user's own to remove
    const face = { ...linked, user: { ...linked.user, avatarUrl: '/api/people/aaaaaaaaaaaaaaaa/avatar?v=2' } };
    expect(renderToStaticMarkup(<AvatarSection me={face} />)).not.toContain(i18n.t('account.removeAvatar'));
  });
});

describe('Settings with users on', () => {
  it('keeps only the settings of this browser', () => {
    setAuth({ phase: 'ready', me: me('Administrator', ['library.view', 'plugins.manage', 'users.manage', 'account.tokens']) });
    setLevel('normal');
    const markup = renderToStaticMarkup(<SettingsView />);
    expect(markup).toContain(i18n.t('settings.levelHint'));
    for (const key of ['account.title', 'plugins.title', 'auth.logout'] as const) expect(markup, key).not.toContain(`>${i18n.t(key)}<`);
  });
});
