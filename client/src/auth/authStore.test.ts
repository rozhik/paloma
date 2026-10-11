import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AuthStatus, MeResponse } from '../../../shared/types.js';
import { grantedPermissions, hasPermission, useAuthStore } from './authStore.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

const status = (patch: Partial<AuthStatus> = {}): AuthStatus => ({ mode: 'on', setupPending: false, providers: [], ...patch });
const me = (username: string, patch: Partial<NonNullable<MeResponse['user']>> = {}, permissions: MeResponse['permissions'] = ['library.view']): MeResponse => ({
  mode: 'on', via: 'session',
  user: { id: `id-${username}`, username, displayName: username, roleId: 'viewer', roleName: 'Viewer', mustChangePassword: false, personId: null, personName: null, personVisible: false, avatarUrl: null, ...patch },
  permissions, access: { all: true }, quotas: [],
});

/** Answers API requests by path. */
function serve(routes: Record<string, { status: number; body: unknown }>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = url.split('?')[0];
    const route = routes[path] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(route.body), { status: route.status });
  }));
}

beforeEach(() => {
  useAuthStore.setState({ phase: 'loading', status: null, me: null, lastUserId: null });
  usePalomaStore.setState({ currentView: 'library' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loading', () => {
  it('shows the app with every permission when users are off', async () => {
    serve({
      '/api/auth/status': { status: 200, body: status({ mode: 'off' }) },
      '/api/auth/me': { status: 200, body: { mode: 'off', via: 'off', user: null, permissions: [], access: { all: true }, quotas: [] } },
    });
    await useAuthStore.getState().load('en');
    expect(useAuthStore.getState().phase).toBe('ready');
    expect(grantedPermissions()).toBeNull();
    expect(hasPermission('users.manage')).toBe(true);
  });

  it('asks for the first administrator when setup is pending', async () => {
    serve({ '/api/auth/status': { status: 200, body: status({ setupPending: true }) } });
    await useAuthStore.getState().load('en');
    expect(useAuthStore.getState().phase).toBe('setup');
  });

  it('shows the login page without a session', async () => {
    serve({ '/api/auth/status': { status: 200, body: status() }, '/api/auth/me': { status: 401, body: { code: 'unauthenticated', error: '' } } });
    await useAuthStore.getState().load('en');
    expect(useAuthStore.getState().phase).toBe('login');
  });

  it('asks for a new password first when an administrator set it', async () => {
    serve({ '/api/auth/status': { status: 200, body: status() }, '/api/auth/me': { status: 200, body: me('ben', { mustChangePassword: true }) } });
    await useAuthStore.getState().load('en');
    expect(useAuthStore.getState().phase).toBe('changePassword');
  });

  it('reports a server it cannot reach', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await useAuthStore.getState().load('en');
    expect(useAuthStore.getState().phase).toBe('error');
  });
});

describe('sessions', () => {
  it('keeps the open view when the same user logs in again', async () => {
    useAuthStore.setState({ status: status() });
    useAuthStore.getState().enter(me('anna'));
    usePalomaStore.setState({ currentView: 'map' });
    useAuthStore.getState().sessionEnded();
    expect(useAuthStore.getState().phase).toBe('login');
    expect(usePalomaStore.getState().currentView).toBe('map');

    useAuthStore.getState().enter(me('anna'));
    expect(useAuthStore.getState().phase).toBe('ready');
    expect(usePalomaStore.getState().currentView).toBe('map');
  });

  it('starts another user at the library', () => {
    useAuthStore.setState({ status: status() });
    useAuthStore.getState().enter(me('anna'));
    usePalomaStore.setState({ currentView: 'map' });
    useAuthStore.getState().sessionEnded();
    useAuthStore.getState().enter(me('ben'));
    expect(usePalomaStore.getState().currentView).toBe('library');
  });

  it('ignores an ended session when users are off', () => {
    useAuthStore.setState({ status: status({ mode: 'off' }), phase: 'ready' });
    useAuthStore.getState().sessionEnded();
    expect(useAuthStore.getState().phase).toBe('ready');
  });

  it('gives the current user permissions', () => {
    useAuthStore.getState().enter(me('ben', {}, ['library.view', 'photos.edit']));
    expect([...grantedPermissions()!]).toEqual(['library.view', 'photos.edit']);
    expect(hasPermission('export')).toBe(false);
  });

  it('keeps the same object when the user did not change', () => {
    useAuthStore.getState().enter(me('ben'));
    const first = useAuthStore.getState().me;
    useAuthStore.getState().enter(me('ben'));
    expect(useAuthStore.getState().me).toBe(first);
  });
});
