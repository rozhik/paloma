import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MeResponse, Permission } from '../../../shared/types.js';
import { useAuthStore } from '../auth/authStore.js';
import { i18n, initI18n } from '../i18n/index.js';
import { DEFAULT_UI_SETTINGS, useUiSettings } from '../settings/uiSettings.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { SKINS, SKIN_IDS } from '../appearance/skins/index.js';
import { initialsOf, userMenuItemsFor } from './userMenu.js';
import { UserMenuButton } from './UserMenuButton.js';

const ADMIN: Permission[] = ['library.view', 'photos.edit', 'albums.manage', 'people.manage', 'export', 'account.tokens', 'plugins.manage', 'users.manage'];
const me = (displayName: string, permissions: Permission[]): MeResponse => ({
  mode: 'on', via: 'session',
  user: { id: 'u', username: 'anna', displayName, roleId: 'admin', roleName: 'Administrator', mustChangePassword: false, personId: null, personName: null, personVisible: false, avatarUrl: null },
  permissions, access: { all: true }, quotas: [],
});

/** Sets store state for a server render: zustand renders its initial state there, so that is changed too. */
function setAuth(value: MeResponse | null) {
  useAuthStore.setState({ me: value, phase: 'ready' });
  Object.assign(useAuthStore.getInitialState(), { me: value, phase: 'ready' });
}
function setLevel(level: typeof DEFAULT_UI_SETTINGS.level) {
  useUiSettings.setState({ level, pin: null });
  Object.assign(useUiSettings.getInitialState(), { level, pin: null });
}

beforeAll(async () => {
  await initI18n('en');
});

afterEach(() => {
  setAuth(null);
  setLevel(DEFAULT_UI_SETTINGS.level);
});

describe('user menu items', () => {
  it('offer an administrator Account, Admin, Server settings and Log out', () => {
    setAuth(me('Anna Kovalenko', ADMIN));
    expect(userMenuItemsFor('normal')).toEqual(['account', 'admin', 'server', 'logout']);
  });

  it('offer a viewer Account and Log out', () => {
    setAuth(me('Ben', ['library.view']));
    expect(userMenuItemsFor('developer')).toEqual(['account', 'logout']);
  });

  it('offer only Log out at Child, and Account from Easy', () => {
    setAuth(me('Anna Kovalenko', ADMIN));
    expect(userMenuItemsFor('child')).toEqual(['logout']);
    expect(userMenuItemsFor('easy')).toEqual(['account', 'logout']);
  });

  it('offer only Server settings with users off', () => {
    setAuth({ mode: 'off', via: 'off', user: null, permissions: [], access: { all: true }, quotas: [] });
    expect(userMenuItemsFor('normal')).toEqual(['server']);
    expect(userMenuItemsFor('easy')).toEqual([]);
  });
});

describe('My photos', () => {
  const linked = (personVisible: boolean): MeResponse => {
    const value = me('Ben Avery', ['library.view']);
    return { ...value, user: { ...value.user!, personId: 'aaaaaaaaaaaaaaaa', personName: 'Ben Avery', personVisible } };
  };

  it('comes first for a user linked with a person they may see, from Easy', () => {
    setAuth(linked(true));
    expect(userMenuItemsFor('easy')).toEqual(['photos', 'account', 'logout']);
    expect(userMenuItemsFor('child')).toEqual(['logout']);
  });

  it('is not offered when the user may not see the person', () => {
    setAuth(linked(false));
    expect(userMenuItemsFor('normal')).toEqual(['account', 'logout']);
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first and last word', () => {
    expect(initialsOf('Anna Kovalenko')).toBe('AK');
    expect(initialsOf('anna maria kovalenko')).toBe('AK');
    expect(initialsOf('ben')).toBe('B');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('UserMenuButton', () => {
  it('shows the initials, labelled with the name', () => {
    setAuth(me('Anna Kovalenko', ADMIN));
    const markup = renderToStaticMarkup(<UserMenuButton />);
    expect(markup).toContain('>AK<');
    expect(markup).toContain(`aria-label="${i18n.t('userMenu.open', { name: 'Anna Kovalenko' })}"`);
  });

  it('shows the avatar picture when there is one', () => {
    const value = me('Anna Kovalenko', ADMIN);
    setAuth({ ...value, user: { ...value.user!, avatarUrl: '/api/users/u/avatar?v=abc' } });
    const markup = renderToStaticMarkup(<UserMenuButton />);
    expect(markup).toContain('src="/api/users/u/avatar?v=abc"');
    expect(markup).not.toContain('>AK<');
  });

  it('shows a person icon with users off', () => {
    const markup = renderToStaticMarkup(<UserMenuButton />);
    expect(markup).toContain('<svg');
    expect(markup).toContain(i18n.t('userMenu.open', { name: i18n.t('userMenu.localUser') }));
  });

  it('is at the end of the navigation in every skin', async () => {
    setAuth(me('Anna Kovalenko', ADMIN));
    usePalomaStore.setState({ currentView: 'library' });
    for (const id of SKIN_IDS) {
      const { AppShell } = await SKINS[id].load();
      const markup = renderToStaticMarkup(
        <AppShell view="library" tray={{ onOpenExport: () => {}, onOpenPrint: () => {}, onOpenMovie: () => {} }}><p>content</p></AppShell>,
      );
      expect(markup, id).toContain('user-menu-btn');
      expect(markup, id).toContain('>AK<');
    }
  });
});
