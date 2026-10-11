import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { writeTestPlugin } from '../plugins/testing.js';

const GRAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';

// config.ts reads the environment at import time, so the routes are imported after it points at temp folders
let tmpDir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_plugin_routes_test_')));
  const external = path.join(tmpDir, 'plugins');
  const filmGrain = writeTestPlugin(external, 'film-grain', {
    manifest: { name: { en: 'Film grain', uk: 'Плівкове зерно' } },
    module: `export function activate() {
  return { filters: [{ name: 'grain', label: { en: 'Grain', uk: 'Зерно' }, group: 'effects', icon: 'grain.svg', render: ({ image }) => image }] };
}`,
  });
  fs.writeFileSync(path.join(filmGrain, 'grain.svg'), GRAIN_SVG);
  writeTestPlugin(external, 'future', { manifest: { apiVersion: 2 } });
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PLUGINS_DIR', external);
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});

  await (await import('../db/index.js')).openDatabase();
  const { default: express } = await import('express');
  const router = (await import('./index.js')).default as unknown as import('express').Router;
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const send = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

describe('GET /api/plugins', () => {
  it('lists bundled and external plugins with texts in the requested language', async () => {
    const { status, body } = await send('GET', '/plugins?lang=uk');
    expect(status).toBe(200);
    expect(body.map((p: { id: string; source: string; status: string }) => [p.id, p.source, p.status])).toEqual([
      ['ai-openai', 'bundled', 'active'],
      ['auth-password', 'bundled', 'active'],
      ['auth-token', 'bundled', 'active'],
      ['basic-effects', 'bundled', 'active'],
      ['basic-transforms', 'bundled', 'active'],
      ['film-grain', 'external', 'off'],
      ['future', 'external', 'error'],
    ]);
    const byId = (id: string) => body.find((p: { id: string }) => p.id === id);
    expect(byId('basic-effects')).toMatchObject({ name: 'Базові ефекти', version: '1.0.0', enabled: true, authProviders: [] });
    expect(byId('basic-effects').filters.map((f: { name: string; label: string }) => [f.name, f.label])).toEqual([
      ['brightness', 'Яскравість'], ['contrast', 'Контраст'], ['bw', 'Чорно-біле'], ['sepia', 'Сепія'],
    ]);
    expect(byId('film-grain')).toMatchObject({ name: 'Плівкове зерно', filters: [] });
    expect(byId('ai-openai')).toMatchObject({ name: 'OpenAI', aiProviders: [{ id: 'openai', label: 'OpenAI' }], filters: [], authProviders: [] });
    expect(byId('basic-effects').aiProviders).toEqual([]);
    expect(byId('future').error).toBe('the plugin needs plugin API 2, while Paloma supports 1');
  });

  it('lists the bundled auth providers', async () => {
    const { body } = await send('GET', '/plugins?lang=uk');
    const providers = (id: string) => body.find((p: { id: string }) => p.id === id).authProviders
      .map((provider: { id: string; kind: string; label: string }) => [provider.id, provider.kind, provider.label]);
    expect(providers('auth-password')).toEqual([['password', 'credentials', 'Пароль']]);
    expect(providers('auth-token')).toEqual([['token', 'bearer', 'API-токен']]);
  });

  it('reports plugin and filter levels', async () => {
    const { body } = await send('GET', '/plugins');
    const levels = (id: string) => {
      const plugin = body.find((p: { id: string }) => p.id === id);
      return [plugin.level, ...new Set(plugin.filters.map((f: { level: string }) => f.level))];
    };
    expect(levels('basic-effects')).toEqual(['easy', 'easy']);
    expect(levels('basic-transforms')).toEqual(['normal', 'normal']);
  });

  it('falls back to English for a missing translation', async () => {
    const { body } = await send('GET', '/plugins?lang=de');
    expect(body.find((p: { id: string }) => p.id === 'film-grain').name).toBe('Film grain');
    expect(body.find((p: { id: string }) => p.id === 'basic-effects').name).toBe('Grundlegende Effekte');
  });
});

describe('PATCH /api/plugins/:id', () => {
  it('switches a plugin off and on', async () => {
    const off = await send('PATCH', '/plugins/basic-effects', { enabled: false });
    expect(off).toMatchObject({ status: 200, body: { id: 'basic-effects', enabled: false, status: 'off', filters: [] } });
    const { body: listed } = await send('GET', '/plugins');
    expect(listed.find((p: { id: string }) => p.id === 'basic-effects')).toMatchObject({ enabled: false, status: 'off' });

    const on = await send('PATCH', '/plugins/basic-effects', { enabled: true });
    expect(on).toMatchObject({ status: 200, body: { enabled: true, status: 'active' } });
  });

  it('switches an external plugin on, which makes its filters available', async () => {
    const { status, body } = await send('PATCH', '/plugins/film-grain?lang=uk', { enabled: true });
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'active', filters: [{ name: 'grain', label: 'Зерно' }] });
    await send('PATCH', '/plugins/film-grain', { enabled: false });
  });

  it('rejects an invalid body with 400 and changes nothing', async () => {
    for (const bad of [{ enabled: 'no' }, {}, { enabled: true, extra: 1 }]) {
      expect(await send('PATCH', '/plugins/basic-effects', bad)).toMatchObject({ status: 400, body: { code: 'plugin_invalid_body' } });
    }
    const { body } = await send('GET', '/plugins');
    expect(body.find((p: { id: string }) => p.id === 'basic-effects').enabled).toBe(true);
  });

  it('responds 404 for an unknown plugin', async () => {
    expect(await send('PATCH', '/plugins/nope', { enabled: true })).toMatchObject({ status: 404, body: { code: 'plugin_not_found', params: { id: 'nope' } } });
  });

  it('responds 409 for a plugin that cannot be used', async () => {
    expect(await send('PATCH', '/plugins/future', { enabled: true })).toMatchObject({ status: 409, body: { code: 'plugin_unavailable' } });
  });
});

describe('GET /api/plugins/:id/filters/:name/icon', () => {
  it('serves the icon of an active plugin as SVG, and 404 once it is switched off', async () => {
    const { body } = await send('PATCH', '/plugins/film-grain', { enabled: true });
    const url: string = body.filters[0].iconUrl;
    expect(url).toBe('/api/plugins/film-grain/filters/grain/icon?v=1.0.0');

    const res = await fetch(`${base}${url.replace(/^\/api/, '')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^image\/svg\+xml/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe(GRAIN_SVG);

    await send('PATCH', '/plugins/film-grain', { enabled: false });
    expect(await send('GET', '/plugins/film-grain/filters/grain/icon')).toMatchObject({ status: 404, body: { code: 'plugin_not_found' } });
  });

  it('responds 404 for an unknown plugin or a filter without an icon', async () => {
    expect(await send('GET', '/plugins/nope/filters/grain/icon')).toMatchObject({ status: 404, body: { code: 'plugin_not_found' } });
    expect(await send('GET', '/plugins/basic-effects/filters/nope/icon'))
      .toMatchObject({ status: 404, body: { code: 'filter_not_found', params: { id: 'basic-effects', filter: 'nope' } } });
  });
});

describe('GET /api/server/info with users off', () => {
  it('says users are off', async () => {
    const { status, body } = await send('GET', '/server/info');
    expect([status, body.authMode, body.photosDirs]).toEqual([200, 'off', []]);
  });
});
