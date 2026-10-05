import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { writeTestPlugin } from '../plugins/testing.js';

// config.ts reads the environment at import time, so the routes are imported after it points at temp folders
let tmpDir: string;
let server: Server;
let base: string;

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_plugin_routes_test_')));
  const external = path.join(tmpDir, 'plugins');
  writeTestPlugin(external, 'film-grain', {
    manifest: { name: { en: 'Film grain', uk: 'Плівкове зерно' } },
    module: `export function activate() {
  return { filters: [{ name: 'grain', label: { en: 'Grain', uk: 'Зерно' }, group: 'effects', render: ({ image }) => image }] };
}`,
  });
  writeTestPlugin(external, 'future', { manifest: { apiVersion: 2 } });
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PLUGINS_DIR', external);
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});

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
      ['basic-effects', 'bundled', 'active'],
      ['basic-transforms', 'bundled', 'active'],
      ['film-grain', 'external', 'off'],
      ['future', 'external', 'error'],
    ]);
    expect(body[0]).toMatchObject({ name: 'Базові ефекти', version: '1.0.0', enabled: true });
    expect(body[0].filters.map((f: { name: string; label: string }) => [f.name, f.label])).toEqual([
      ['brightness', 'Яскравість'], ['contrast', 'Контраст'], ['bw', 'Чорно-біле'], ['sepia', 'Сепія'],
    ]);
    expect(body[2]).toMatchObject({ name: 'Плівкове зерно', filters: [] });
    expect(body[3].error).toBe('the plugin needs plugin API 2, while Paloma supports 1');
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
