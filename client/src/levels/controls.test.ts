import { describe, it, expect, afterEach } from 'vitest';
import type { MeResponse, Permission } from '../../../shared/types.js';
import { useAuthStore } from '../auth/authStore.js';
import { CONTROL_LEVELS, CONTROL_PERMISSIONS, allows, type ControlId } from './controls.js';
import { LEVELS } from './levels.js';
import { NAV_ITEMS } from '../shell/navigation.js';
import { TRAY_ACTION_IDS, trayActionsFor } from '../shell/useTray.js';
import { SIDEBAR_LISTS } from '../settings/uiSettings.js';

describe('control levels', () => {
  it('give every navigation item, tray action and sidebar list a level', () => {
    const ids = [
      ...NAV_ITEMS.map(({ view }) => `view.${view}`),
      ...TRAY_ACTION_IDS.map((id) => `tray.${id}`),
      ...SIDEBAR_LISTS.map((id) => `sidebar.${id}`),
    ];
    for (const id of ids) expect(LEVELS).toContain(CONTROL_LEVELS[id as ControlId]);
  });

  it('match the documented table', () => {
    expect(CONTROL_LEVELS['tray.export']).toBe('easy');
    expect(CONTROL_LEVELS['view.map']).toBe('normal');
    expect(CONTROL_LEVELS.slideshow).toBe('child');
    expect(CONTROL_LEVELS['viewer.editBar']).toBe('easy');
    expect(CONTROL_LEVELS['album.delete']).toBe('normal');
    expect(CONTROL_LEVELS['viewer.info']).toBe('easy');
    expect(CONTROL_LEVELS['sidebar.tags']).toBe('easy');
    expect(CONTROL_LEVELS['tray.addTags']).toBe('easy');
    expect(CONTROL_LEVELS['tray.removeTag']).toBe('easy');
    expect(CONTROL_LEVELS['view.server']).toBe('normal');
  });

  it('let Easy see people and only Normal change them; Child sees none', () => {
    const seeing = ['sidebar.people', 'people.choose', 'info.people', 'viewer.faces'] as const;
    const changing = ['view.people', 'people.edit', 'info.people.edit', 'viewer.faces.assign', 'faces.detect', 'faces.similar', 'faces.unrecognized'] as const;
    for (const id of seeing) expect([allows('child', id), allows('easy', id)], id).toEqual([false, true]);
    for (const id of changing) expect([allows('easy', id), allows('normal', id)], id).toEqual([false, true]);
  });

  it('offer AI from Normal: running tasks, object frames and AI results', () => {
    for (const id of ['ai.run', 'viewer.objects', 'info.ai'] as const) expect([allows('easy', id), allows('normal', id)], id).toEqual([false, true]);
  });

  it('show memories from Easy, not at Child', () => {
    expect([allows('child', 'sidebar.memories'), allows('easy', 'sidebar.memories')]).toEqual([false, true]);
  });

  it('show the Info panel at Easy, its EXIF from Professional and its JSON only at Developer', () => {
    expect(['child', 'easy', 'normal', 'pro', 'developer'].map((level) => [
      allows(level as never, 'viewer.info'), allows(level as never, 'info.exif'), allows(level as never, 'info.json'),
    ])).toEqual([
      [false, false, false], [true, false, false], [true, false, false], [true, true, false], [true, true, true],
    ]);
  });

  it('show Child only the library, albums, viewing, slideshow, settings and the user menu', () => {
    const child = (Object.keys(CONTROL_LEVELS) as ControlId[]).filter((id) => allows('child', id)).sort();
    expect(child).toEqual([
      'entry.menu', 'photo.open', 'sidebar.albums', 'slideshow', 'user.menu', 'view.library', 'view.settings', 'viewer.navigate', 'viewer.zoom',
    ]);
  });

  it('show Developer everything, except what exists only when users are on', () => {
    const authOnly = ['view.admin', 'view.account', 'account.tokens', 'user.logout'];
    for (const id of Object.keys(CONTROL_LEVELS) as ControlId[]) expect(allows('developer', id), id).toBe(!authOnly.includes(id));
  });
});

describe('control permissions', () => {
  const signIn = (permissions: Permission[]) => {
    const me: MeResponse = {
      mode: 'on', via: 'session',
      user: { id: 'u', username: 'ben', displayName: 'Ben', roleId: 'r', roleName: 'R', mustChangePassword: false, personId: null, personName: null, personVisible: false, avatarUrl: null },
      permissions, access: { all: true }, quotas: [],
    };
    useAuthStore.setState({ me, phase: 'ready' });
  };
  afterEach(() => useAuthStore.setState({ me: null, phase: 'loading' }));

  /** Controls that only show the library or the user's own account; every other control needs a permission. */
  const READ_ONLY: readonly ControlId[] = [
    'view.library', 'view.settings', 'view.people', 'view.map', 'view.collage', 'view.account', 'user.menu', 'user.logout',
    'sidebar.albums', 'sidebar.shortcuts', 'sidebar.memories', 'sidebar.folders', 'sidebar.tags', 'sidebar.people',
    'photo.open', 'photo.select', 'viewer.navigate', 'viewer.zoom', 'viewer.info', 'viewer.faces', 'slideshow',
    'entry.menu', 'entry.info', 'search', 'people.choose', 'info.people', 'info.exif', 'info.json', 'tray.clear', 'tray.print',
    'viewer.objects', 'info.ai',
  ];

  it('give every control that changes something a permission', () => {
    for (const id of Object.keys(CONTROL_LEVELS) as ControlId[]) {
      expect(READ_ONLY.includes(id) || CONTROL_PERMISSIONS[id] !== undefined, id).toBe(true);
    }
  });

  it('let only ai.run start AI tasks; viewers still see object frames and results', () => {
    signIn(['library.view']);
    expect([allows('developer', 'ai.run'), allows('normal', 'viewer.objects'), allows('normal', 'info.ai')]).toEqual([false, true, true]);
    signIn(['library.view', 'ai.run']);
    expect(allows('normal', 'ai.run')).toBe(true);
  });

  it('offer a viewer only Clear and Print in the tray', () => {
    signIn(['library.view']);
    expect(trayActionsFor('normal')).toEqual(['clear', 'print']);
    for (const id of ['photo.star', 'viewer.editBar', 'info.edit', 'album.editProperties', 'people.edit'] as const) {
      expect(allows('developer', id), id).toBe(false);
    }
  });

  it('show Log out from Child, the Account view from Easy, and tokens, Admin and Server settings from Normal, by permission', () => {
    signIn(['library.view', 'account.tokens', 'users.manage', 'plugins.manage']);
    expect(allows('child', 'user.logout')).toBe(true);
    expect(allows('child', 'view.account')).toBe(false);
    expect(allows('easy', 'view.account')).toBe(true);
    expect(allows('easy', 'view.server')).toBe(false);
    expect(allows('normal', 'view.server')).toBe(true);
    expect(allows('easy', 'account.tokens')).toBe(false);
    expect(allows('normal', 'account.tokens')).toBe(true);
    expect(allows('easy', 'view.admin')).toBe(false);
    expect(allows('normal', 'view.admin')).toBe(true);

    signIn(['library.view', 'photos.edit', 'albums.manage', 'export']);
    expect(allows('developer', 'view.admin')).toBe(false);
    expect(allows('developer', 'view.server')).toBe(false);
    expect(allows('developer', 'account.tokens')).toBe(false);
  });
});
