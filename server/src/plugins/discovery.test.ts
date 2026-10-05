import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverPlugins } from './discovery.js';
import { writeTestPlugin } from './testing.js';

let tmp: string;
let bundled: string;
let external: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_discovery_test_')));
  bundled = path.join(tmp, 'bundled');
  external = path.join(tmp, 'external');
  fs.mkdirSync(bundled);
  fs.mkdirSync(external);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const summary = (plugins: ReturnType<typeof discoverPlugins>) =>
  plugins.map(({ id, source, manifest, error }) => ({ id, source, ok: manifest !== null, error }));

describe('discoverPlugins', () => {
  it('lists bundled plugins first, then external ones, each by folder name', () => {
    writeTestPlugin(external, 'zeta');
    writeTestPlugin(external, 'alpha');
    writeTestPlugin(bundled, 'basic');
    expect(summary(discoverPlugins(bundled, external))).toEqual([
      { id: 'basic', source: 'bundled', ok: true, error: null },
      { id: 'alpha', source: 'external', ok: true, error: null },
      { id: 'zeta', source: 'external', ok: true, error: null },
    ]);
  });

  it('finds a plugin cloned from a git repository under its own folder name', () => {
    const folder = writeTestPlugin(external, 'paloma-film-grain', { id: 'film-grain' });
    fs.mkdirSync(path.join(folder, '.git'));
    expect(summary(discoverPlugins(bundled, external))).toEqual([
      { id: 'film-grain', source: 'external', ok: true, error: null },
    ]);
  });

  it('ignores subfolders without a manifest, hidden folders and files', () => {
    fs.mkdirSync(path.join(external, 'notes'));
    fs.writeFileSync(path.join(external, 'README.md'), 'hi');
    writeTestPlugin(external, '.hidden');
    expect(discoverPlugins(bundled, external)).toEqual([]);
  });

  it('has no external plugins when the external folder does not exist', () => {
    writeTestPlugin(bundled, 'basic');
    expect(summary(discoverPlugins(bundled, path.join(tmp, 'missing')))).toEqual([
      { id: 'basic', source: 'bundled', ok: true, error: null },
    ]);
  });

  it('lists a plugin with an invalid manifest by its folder name with the error', () => {
    fs.mkdirSync(path.join(external, 'broken'));
    fs.writeFileSync(path.join(external, 'broken', 'paloma-plugin.json'), '{ nope');
    const [plugin] = discoverPlugins(bundled, external);
    expect(plugin).toMatchObject({ id: 'broken', source: 'external', manifest: null });
    expect(plugin.error).toMatch(/not valid JSON/);
  });

  it('lets a bundled plugin win over an external one with the same id', () => {
    writeTestPlugin(bundled, 'basic-effects');
    writeTestPlugin(external, 'my-effects', { id: 'basic-effects' });
    expect(summary(discoverPlugins(bundled, external))).toEqual([
      { id: 'basic-effects', source: 'bundled', ok: true, error: null },
      { id: 'my-effects', source: 'external', ok: false, error: 'another plugin already uses the id "basic-effects"' },
    ]);
  });

  it('lets the external plugin whose folder sorts first win a duplicate id', () => {
    writeTestPlugin(external, 'b-grain', { id: 'grain' });
    writeTestPlugin(external, 'a-grain', { id: 'grain' });
    const plugins = discoverPlugins(bundled, external);
    expect(plugins[0]).toMatchObject({ id: 'grain', folder: path.join(external, 'a-grain'), error: null });
    expect(plugins[1]).toMatchObject({ id: 'b-grain', error: 'another plugin already uses the id "grain"' });
  });

  it('gives unique ids when a losing folder name is taken too', () => {
    writeTestPlugin(bundled, 'basic-effects');
    writeTestPlugin(external, 'basic-effects');
    expect(discoverPlugins(bundled, external).map((p) => p.id)).toEqual(['basic-effects', 'external/basic-effects']);
  });
});
