import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Router } from 'express';
import { openTestDatabase } from '../auth/testing.js';
import type { Guard } from '../auth/middleware.js';

// Every API route must start with exactly one need() guard, so a new route cannot stay open by accident
let cleanup: () => void;
let routes: { method: string; path: string; guards: Guard[]; firstIsGuard: boolean }[];

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: Partial<Guard> }[] };
}

beforeAll(async () => {
  ({ cleanup } = await openTestDatabase('paloma_guards_test_'));
  const router = (await import('./index.js')).default as unknown as Router;
  const layers = router.stack as unknown as Layer[];
  routes = layers.filter((layer) => layer.route).flatMap(({ route }) => Object.keys(route!.methods).map((method) => {
    const handles = route!.stack.map((layer) => layer.handle);
    const guards = handles.filter((handle): handle is Guard => typeof handle.requirement === 'string');
    return { method: method.toUpperCase(), path: route!.path, guards, firstIsGuard: guards[0] === handles[0] };
  }));
});

afterAll(() => cleanup());

describe('route guards', () => {
  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(60);
  });

  it('starts every route with exactly one guard', () => {
    const unguarded = routes.filter((route) => route.guards.length !== 1 || !route.firstIsGuard).map((r) => `${r.method} ${r.path}`);
    expect(unguarded).toEqual([]);
  });

  it('keeps public routes to the auth status, setup and login', () => {
    const open = routes.filter((route) => route.guards[0].requirement === 'public').map((r) => `${r.method} ${r.path}`);
    expect(open.sort()).toEqual(['GET /auth/status', 'POST /auth/login/:provider', 'POST /auth/setup']);
  });

  it('protects what changes the library with the matching permission', () => {
    const requirement = (method: string, path: string) => routes.find((r) => r.method === method && r.path === path)?.guards[0].requirement;
    expect(requirement('PATCH', '/photos/:id/star')).toBe('photos.edit');
    expect(requirement('PUT', '/photos/:id/edits')).toBe('photos.edit');
    expect(requirement('POST', '/albums')).toBe('albums.manage');
    expect(requirement('DELETE', '/people/:id')).toBe('people.manage');
    expect(requirement('POST', '/export')).toBe('export');
    expect(requirement('POST', '/creation/movie')).toBe('export');
    expect(requirement('PATCH', '/plugins/:id')).toBe('plugins.manage');
    expect(requirement('POST', '/admin/users')).toBe('users.manage');
    // Every write route needs a permission beyond viewing the library, except the user's own account
    const writes = routes.filter((r) => r.method !== 'GET' && !r.path.startsWith('/auth/'));
    expect(writes.filter((r) => ['public', 'authenticated', 'library.view'].includes(r.guards[0].requirement)).map((r) => `${r.method} ${r.path}`))
      .toEqual([]);
  });

  it('keeps tokens away from credentials, sessions and tokens', () => {
    const sessionOnly = routes.filter((route) => route.guards[0].sessionOnly).map((r) => `${r.method} ${r.path}`).sort();
    expect(sessionOnly).toEqual([
      'DELETE /admin/sessions/:id', 'DELETE /admin/tokens/:id', 'DELETE /auth/sessions/:id', 'DELETE /auth/tokens/:id',
      'GET /admin/sessions', 'GET /admin/tokens', 'GET /auth/sessions',
      'POST /admin/users/:id/password', 'POST /auth/logout', 'POST /auth/password', 'POST /auth/tokens',
    ]);
  });
});
