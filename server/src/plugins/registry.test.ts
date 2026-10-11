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

beforeEach(async () => {
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

afterEach(async () => {
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
      level: 'normal',
      enabled: true,
      status: 'active',
      error: null,
      warnings: [],
      authProviders: [],
      filters: [{
        name: 'sepia',
        label: 'sepia мітка',
        group: 'effects',
        params: [{ name: 'amount', label: 'Amount', type: 'number', min: 0, max: 100, step: 1, default: 20 }],
        level: 'normal',
      }],
    }]);
  });

  describe('levels', () => {
    const leveledModule = (filters: { name: string; level?: string }[]) => `
export function activate() {
  return {
    filters: ${JSON.stringify(filters)}.map((filter) => ({
      ...filter, label: filter.name, group: 'effects', render: ({ image }) => image,
    })),
  };
}
`;

    it('gives filters without a level their plugin\'s level, and keeps a filter\'s own', async () => {
      writeTestPlugin(bundled, 'film-grain', {
        manifest: { level: 'easy' },
        module: leveledModule([{ name: 'grain' }, { name: 'dust', level: 'pro' }]),
      });
      const registry = newRegistry();
      await registry.init();
      const info = registry.get('film-grain')!;
      expect(info.level).toBe('easy');
      expect(info.filters.map(({ name, level }) => ({ name, level }))).toEqual([
        { name: 'grain', level: 'easy' }, { name: 'dust', level: 'pro' },
      ]);
    });

    it('drops a filter with an unknown level and keeps the others', async () => {
      writeTestPlugin(bundled, 'film-grain', { module: leveledModule([{ name: 'grain', level: 'expert' }, { name: 'dust' }]) });
      const registry = newRegistry();
      await registry.init();
      const info = registry.get('film-grain')!;
      expect(info.filters.map((filter) => filter.name)).toEqual(['dust']);
      expect(info.warnings.join('\n')).toMatch(/filter "grain" has level "expert"/);
      expect(registry.getFilter('grain')).toBeUndefined();
      expect(registry.getFilter('dust')?.pluginId).toBe('film-grain');
    });

    it('lists a plugin with an unknown level as an error', async () => {
      writeTestPlugin(bundled, 'film-grain', { manifest: { level: 'expert' }, module: leveledModule([{ name: 'grain' }]) });
      const registry = newRegistry();
      await registry.init();
      expect(registry.get('film-grain')).toMatchObject({ status: 'error', level: 'normal', filters: [] });
      expect(registry.get('film-grain')!.error).toMatch(/"level" must be one of/);
      expect(registry.getFilter('grain')).toBeUndefined();
    });
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

describe('filter icons', () => {
  const iconModule = (icon: unknown) => `
export function activate() {
  return { filters: [{ name: 'grain', label: 'Grain', group: 'effects', icon: ${JSON.stringify(icon)}, render: ({ image }) => image }] };
}`;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>';

  it('lists the URL of a usable icon and resolves it to the file', async () => {
    const folder = writeTestPlugin(bundled, 'film', { module: iconModule('icons/grain.svg'), version: '1.2.0' });
    fs.mkdirSync(path.join(folder, 'icons'));
    fs.writeFileSync(path.join(folder, 'icons', 'grain.svg'), svg);
    const registry = newRegistry();
    await registry.init();

    const info = registry.get('film')!;
    expect(info.warnings).toEqual([]);
    expect(info.filters[0].iconUrl).toBe('/api/plugins/film/filters/grain/icon?v=1.2.0');
    expect(registry.getFilterIcon('film', 'grain')).toEqual({ file: path.join(folder, 'icons', 'grain.svg') });
  });

  it.each([
    ['a path outside the plugin folder', '../../secret.svg'],
    ['an absolute path', '/etc/secret.svg'],
    ['a file that is not .svg', 'icons/grain.png'],
    ['a missing file', 'icons/missing.svg'],
    ['a symlink leading out of the folder', 'icons/link.svg'],
  ])('drops %s with a warning and keeps the filter', async (_case, icon) => {
    fs.writeFileSync(path.join(tmp, 'secret.svg'), svg);
    const folder = writeTestPlugin(bundled, 'film', { module: iconModule(icon) });
    fs.mkdirSync(path.join(folder, 'icons'));
    fs.writeFileSync(path.join(folder, 'icons', 'grain.png'), 'png');
    fs.symlinkSync(path.join(tmp, 'secret.svg'), path.join(folder, 'icons', 'link.svg'));
    const registry = newRegistry();
    await registry.init();

    const info = registry.get('film')!;
    expect(info.status).toBe('active');
    expect(info.filters[0].name).toBe('grain');
    expect(info.filters[0].iconUrl).toBeUndefined();
    expect(info.warnings).toEqual([
      `filter "grain": icon ${JSON.stringify(icon)} is not an .svg file inside the plugin folder; the filter has no icon`,
    ]);
    expect(registry.getFilter('grain')?.pluginId).toBe('film');
    expect(registry.getFilterIcon('film', 'grain')).toEqual({ missing: 'filter' });
  });

  it('drops an icon that is not a string', async () => {
    writeTestPlugin(bundled, 'film', { module: iconModule(42) });
    const registry = newRegistry();
    await registry.init();
    expect(registry.get('film')!.warnings).toEqual(['filter "grain": icon is not a file path; the filter has no icon']);
    expect(registry.getFilter('grain')).toBeDefined();
  });

  it('does not give the icon of a plugin that is off or unknown', async () => {
    const folder = writeTestPlugin(external, 'film', { module: iconModule('grain.svg') });
    fs.writeFileSync(path.join(folder, 'grain.svg'), svg);
    const registry = newRegistry();
    await registry.init();

    expect(registry.getFilterIcon('film', 'grain')).toEqual({ missing: 'plugin' });
    expect(registry.getFilterIcon('nope', 'grain')).toEqual({ missing: 'plugin' });
    await registry.setEnabled('film', true);
    expect(registry.getFilterIcon('film', 'grain')).toEqual({ file: path.join(folder, 'grain.svg') });
    expect(registry.getFilterIcon('film', 'other')).toEqual({ missing: 'filter' });
  });
});

describe('auth providers', () => {
  const providerModule = (providers: { id: string; kind: string }[]) => `
export function activate() {
  return {
    authProviders: ${JSON.stringify(providers)}.map((provider) => ({
      ...provider,
      label: { en: provider.id + ' login', uk: provider.id + ' вхід' },
      fields: [{ name: 'username', label: { en: 'Username', uk: 'Імʼя' }, type: 'text' }],
      login: async () => null,
      authenticate: async () => null,
    })),
  };
}
`;

  it('lists the providers of active plugins with localized labels and fields', async () => {
    writeTestPlugin(bundled, 'auth-password', { module: providerModule([{ id: 'password', kind: 'credentials' }]) });
    writeTestPlugin(bundled, 'auth-token', { module: providerModule([{ id: 'token', kind: 'bearer' }]) });
    const registry = newRegistry();
    await registry.init();

    expect(registry.get('auth-password', 'uk')!.authProviders).toEqual([
      { id: 'password', kind: 'credentials', label: 'password вхід', fields: [{ name: 'username', label: 'Імʼя', type: 'text' }] },
    ]);
    expect(registry.get('auth-token')!.authProviders).toEqual([{ id: 'token', kind: 'bearer', label: 'token login', fields: [] }]);
    expect(registry.getAuthProviders().map((p) => [p.pluginId, p.definition.id])).toEqual([['auth-password', 'password'], ['auth-token', 'token']]);
  });

  it('does not offer a provider of an unknown kind and warns', async () => {
    writeTestPlugin(external, 'oidc', { module: providerModule([{ id: 'oidc', kind: 'redirect' }]) });
    const registry = newRegistry();
    await registry.init();
    const info = await registry.setEnabled('oidc', true);
    expect(info.authProviders).toEqual([]);
    expect(info.warnings).toEqual([expect.stringContaining('auth provider "oidc" has kind "redirect"')]);
    expect(registry.getAuthProvider('oidc')).toBeUndefined();
  });

  it('keeps a taken provider id with the bundled plugin and warns the external one', async () => {
    writeTestPlugin(bundled, 'auth-password', { module: providerModule([{ id: 'password', kind: 'credentials' }]) });
    writeTestPlugin(external, 'evil', { module: providerModule([{ id: 'password', kind: 'credentials' }]) });
    const registry = newRegistry();
    await registry.init();
    const info = await registry.setEnabled('evil', true);
    expect(registry.getAuthProvider('password')?.pluginId).toBe('auth-password');
    expect(info.warnings).toEqual(['auth provider "password" is not available: plugin "auth-password" already provides it']);
    expect(info.authProviders).toEqual([]);
  });

  it('drops the providers of a plugin that is switched off', async () => {
    writeTestPlugin(bundled, 'auth-token', { module: providerModule([{ id: 'token', kind: 'bearer' }]) });
    const registry = newRegistry();
    await registry.init();
    await registry.setEnabled('auth-token', false);
    expect(registry.getAuthProviders()).toEqual([]);
    expect(registry.get('auth-token')!.authProviders).toEqual([]);
  });

  describe('the last login provider', () => {
    const guarded = (on: boolean) => new PluginRegistry({ bundledDir: bundled, externalDir: external, stateFile, requireLoginProvider: () => on });

    it('stays on while auth is on', async () => {
      writeTestPlugin(bundled, 'auth-password', { module: providerModule([{ id: 'password', kind: 'credentials' }]) });
      writeTestPlugin(bundled, 'auth-token', { module: providerModule([{ id: 'token', kind: 'bearer' }]) });
      const registry = guarded(true);
      await registry.init();
      const err = await registry.setEnabled('auth-password', false).catch((e) => e);
      expect(err).toBeInstanceOf(PluginRegistryError);
      expect(err.reason).toBe('last_login_provider');
      expect(registry.get('auth-password')!.enabled).toBe(true);
      // A plugin without a login form can still be switched off
      expect((await registry.setEnabled('auth-token', false)).enabled).toBe(false);
    });

    it('can be switched off when another login provider is on, or when auth is off', async () => {
      writeTestPlugin(bundled, 'auth-password', { module: providerModule([{ id: 'password', kind: 'credentials' }]) });
      writeTestPlugin(bundled, 'auth-pin', { module: providerModule([{ id: 'pin', kind: 'credentials' }]) });
      const registry = guarded(true);
      await registry.init();
      expect((await registry.setEnabled('auth-password', false)).enabled).toBe(false);
      await expect(registry.setEnabled('auth-pin', false)).rejects.toMatchObject({ reason: 'last_login_provider' });

      const off = guarded(false);
      await off.init();
      expect((await off.setEnabled('auth-pin', false)).enabled).toBe(false);
    });
  });
});
