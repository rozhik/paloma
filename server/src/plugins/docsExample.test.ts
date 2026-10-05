import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { PluginRegistry } from './registry.js';
import { RenderService } from '../services/RenderService.js';

// The example plugin in docs/plugins.md must work as written: its files are the code blocks
// preceded by `<!-- file: name -->`.
const DOC = path.resolve(__dirname, '..', '..', '..', 'docs', 'plugins.md');

let tmp: string;

function exampleFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  const pattern = /<!-- file: (\S+) -->\n```\w*\n([\s\S]*?)```/g;
  for (const [, name, content] of fs.readFileSync(DOC, 'utf-8').matchAll(pattern)) files[name] = content;
  return files;
}

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_docs_example_')));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('docs/plugins.md example', () => {
  it('has the manifest, package.json and module', () => {
    expect(Object.keys(exampleFiles()).sort()).toEqual(['icons/grain.svg', 'index.js', 'package.json', 'paloma-plugin.json']);
  });

  it('installs as an external plugin that is off, switches on and renders grain', async () => {
    const folder = path.join(tmp, 'external', 'paloma-film-grain');
    fs.mkdirSync(folder, { recursive: true });
    for (const [name, content] of Object.entries(exampleFiles())) {
      fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
      fs.writeFileSync(path.join(folder, name), content);
    }

    const registry = new PluginRegistry({
      bundledDir: path.join(tmp, 'bundled'),
      externalDir: path.join(tmp, 'external'),
      stateFile: path.join(tmp, 'plugins.json'),
    });
    await registry.init();
    expect(registry.get('film-grain', 'uk')).toMatchObject({ name: 'Плівкове зерно', status: 'off' });

    const info = await registry.setEnabled('film-grain', true);
    expect(info).toMatchObject({ status: 'active', warnings: [], error: null });
    expect(info.filters.map((f) => f.name)).toEqual(['grain']);
    expect(info.level).toBe('easy');
    expect(info.filters[0].level).toBe('easy');
    expect(info.filters[0].iconUrl).toBe('/api/plugins/film-grain/filters/grain/icon?v=1.0.0');

    const photo = path.join(tmp, 'grey.png');
    await sharp({ create: { width: 64, height: 48, channels: 3, background: '#808080' } }).png().toFile(photo);
    const lookup = (name: string) => registry.getFilter(name);
    const { data } = await (await RenderService.render(photo, [{ filter: 'grain', amount: 80 }], { lookup })).raw().toBuffer({ resolveWithObject: true });
    expect(new Set(data).size).toBeGreaterThan(10);
  });
});
