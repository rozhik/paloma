import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PluginRegistry, PluginRegistryError } from './registry.js';
import { writeTestPlugin } from './testing.js';

let tmp: string;
let bundled: string;
let external: string;
let stateFile: string;

const filterModule = (filters: string[], extra = '') => `
${extra}
export function activate(host) {
  return {
    filters: ${JSON.stringify(filters)}.map((name) => ({
      name,
      label: { en: name + ' label', uk: name + ' мітка' },
      group: 'effects',
      params: [{ name: 'amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 1, default: 20 }],
      render: ({ image }) => image,
    })),
  };
}
`;

const newRegistry = () => new PluginRegistry({ bundledDir: bundled, externalDir: external, stateFile });

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_registry_test_')));
  bundled = path.join(tmp, 'bundled');
  external = path.join(tmp, 'external');
  stateFile = path.join(tmp, 'data', 'plugins.json');
  fs.mkdirSync(bundled);
  fs.mkdirSync(external);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('PluginRegistry', () => {
  it('loads bundled plugins and lists their filters with localized labels', async () => {
    writeTestPlugin(bundled, 'basic-effects', { module: filterModule(['sepia']) });
    const registry = newRegistry();
    await registry.init();

    expect(registry.getFilter('sepia')?.pluginId).toBe('basic-effects');
    expect(registry.list('uk')).toEqual([{
      id: 'basic-effects',
      name: 'Плагін basic-effects',
      description: 'Test plugin basic-effects',
      version: '1.0.0',
      source: 'bundled',
      enabled: true,
      status: 'active',
      error: null,
      warnings: [],
      filters: [{
        name: 'sepia',
        label: 'sepia мітка',
        group: 'effects',
        params: [{ name: 'amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 1, default: 20 }],
      }],
    }]);
  });

  it('never imports the module of an external plugin that is off', async () => {
    const marker = path.join(tmp, 'loaded.txt');
    writeTestPlugin(external, 'film-grain', {
      module: filterModule(['grain'], `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'loaded');`),
    });
    const registry = newRegistry();
    await registry.init();

    expect(fs.existsSync(marker)).toBe(false);
    expect(registry.get('film-grain')).toMatchObject({ enabled: false, status: 'off', filters: [] });
    expect(registry.getFilter('grain')).toBeUndefined();
  });

  it('switches an external plugin on and off without a restart', async () => {
    writeTestPlugin(external, 'film-grain', { module: filterModule(['grain']) });
    const registry = newRegistry();
    await registry.init();
    const epoch = registry.epoch;

    const on = await registry.setEnabled('film-grain', true);
    expect(on).toMatchObject({ enabled: true, status: 'active' });
    expect(registry.getFilter('grain')?.pluginId).toBe('film-grain');
    expect(registry.epoch).toBe(epoch + 1);

    const off = await registry.setEnabled('film-grain', false);
    expect(off).toMatchObject({ enabled: false, status: 'off', filters: [] });
    expect(registry.getFilter('grain')).toBeUndefined();

    // The choice survives a restart
    await registry.setEnabled('film-grain', true);
    const restarted = newRegistry();
    await restarted.init();
    expect(restarted.getFilter('grain')?.pluginId).toBe('film-grain');
  });

  it('keeps other plugins working when a module throws on load', async () => {
    writeTestPlugin(bundled, 'basic-effects', { module: filterModule(['sepia']) });
    writeTestPlugin(external, 'broken', { module: 'throw new Error("boom");\nexport function activate() { return {}; }' });
    const registry = newRegistry();
    await registry.init();
    const broken = await registry.setEnabled('broken', true);

    expect(broken).toMatchObject({ enabled: true, status: 'error', error: 'boom' });
    expect(registry.getFilter('sepia')?.pluginId).toBe('basic-effects');
  });

  it('reports a module without activate()', async () => {
    writeTestPlugin(bundled, 'empty', { module: 'export const nothing = 1;' });
    const registry = newRegistry();
    await registry.init();
    expect(registry.get('empty')).toMatchObject({ status: 'error', error: 'index.js does not export activate()' });
  });

  it('retries activate() when switched on again after a failure', async () => {
    const flag = path.join(tmp, 'ok.txt');
    writeTestPlugin(bundled, 'flaky', {
      module: `import fs from 'node:fs';
export function activate() {
  if (!fs.existsSync(${JSON.stringify(flag)})) throw new Error('not ready');
  return {};
}`,
    });
    const registry = newRegistry();
    await registry.init();
    expect(registry.get('flaky')).toMatchObject({ status: 'error', error: 'not ready' });

    fs.writeFileSync(flag, '');
    expect(await registry.setEnabled('flaky', true)).toMatchObject({ status: 'active', error: null });
  });

  it('keeps a taken filter name with the first plugin and warns the other', async () => {
    writeTestPlugin(bundled, 'basic-effects', { module: filterModule(['sepia']) });
    writeTestPlugin(external, 'film', { module: filterModule(['sepia', 'grain']) });
    const registry = newRegistry();
    await registry.init();
    const film = await registry.setEnabled('film', true);

    expect(registry.getFilter('sepia')?.pluginId).toBe('basic-effects');
    expect(registry.getFilter('grain')?.pluginId).toBe('film');
    expect(film.filters.map((f) => f.name)).toEqual(['grain']);
    expect(film.warnings).toEqual(['filter "sepia" is not available: plugin "basic-effects" already provides it']);
  });

  it('drops invalid filters and unknown contribution keys with warnings', async () => {
    writeTestPlugin(bundled, 'mixed', {
      module: `export function activate() {
  return {
    mapProvider: {},
    filters: [
      { name: 'good', label: 'Good', group: 'effects', render: ({ image }) => image },
      { name: 'bad', label: 'Bad', group: 'nowhere', render: ({ image }) => image },
      { name: 'range', label: 'Range', group: 'tuning', render: ({ image }) => image,
        params: [{ name: 'amount', label: 'A', type: 'number', min: 0, max: 10, step: 1, default: 50 }] },
    ],
  };
}`,
    });
    const registry = newRegistry();
    await registry.init();
    const info = registry.get('mixed')!;
    expect(info.status).toBe('active');
    expect(info.filters.map((f) => f.name)).toEqual(['good']);
    expect(info.warnings).toEqual([
      '"mapProvider" is not supported by plugin API 1 and is ignored',
      'filter "bad" has unknown group "nowhere"; the filter is ignored',
      'filter "range": parameter "amount" has a default outside its range; the filter is ignored',
    ]);
  });

  it('rejects switching unknown plugins and plugins that cannot be used', async () => {
    writeTestPlugin(external, 'future', { manifest: { apiVersion: 2 } });
    const registry = newRegistry();
    await registry.init();

    expect(registry.get('future')).toMatchObject({ status: 'error', enabled: false });
    await expect(registry.setEnabled('nope', true)).rejects.toMatchObject({ reason: 'not_found' });
    await expect(registry.setEnabled('future', true)).rejects.toBeInstanceOf(PluginRegistryError);
    await expect(registry.setEnabled('future', true)).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('does not write into plugin folders', async () => {
    const folder = writeTestPlugin(external, 'film-grain', { module: filterModule(['grain']) });
    const before = fs.readdirSync(folder).map((name) => [name, fs.readFileSync(path.join(folder, name), 'utf-8')]);
    const registry = newRegistry();
    await registry.init();
    await registry.setEnabled('film-grain', true);
    await registry.setEnabled('film-grain', false);
    const after = fs.readdirSync(folder).map((name) => [name, fs.readFileSync(path.join(folder, name), 'utf-8')]);
    expect(after).toEqual(before);
  });
});
