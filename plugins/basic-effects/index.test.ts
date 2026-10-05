import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RenderService } from '../../server/src/services/RenderService.js';
import { lookupOfPlugin, sharp } from '../../server/src/plugins/testing.js';
import { readManifest } from '../../server/src/plugins/manifest.js';
import { resolveFilterIcon } from '../../server/src/plugins/registry.js';
import { PLUGIN_API_VERSION, type PluginHost } from '../../server/src/plugins/api.js';
import type { FilterLookup } from '../../server/src/services/editChain.js';
import * as plugin from './index.js';

const LANGUAGES = ['en', 'zh-Hans', 'es', 'ar', 'pt-BR', 'fr', 'de', 'ja', 'ru', 'id', 'uk'];

let tmp: string;
let photo: string;
let lookup: FilterLookup;

async function stats(image: sharp.Sharp) {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let spread = 0;
  const values: number[][] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    values.push(rgb);
    sum += (rgb[0] + rgb[1] + rgb[2]) / 3;
  }
  const mean = sum / values.length;
  for (const rgb of values) spread += Math.abs((rgb[0] + rgb[1] + rgb[2]) / 3 - mean);
  return { mean, spread: spread / values.length, values, channels: info.channels };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_basic_effects_'));
  photo = path.join(tmp, 'photo.png');
  // A colourful image: red, green, blue and grey stripes
  const stripe = (background: string) => sharp({ create: { width: 25, height: 40, channels: 3, background } }).png().toBuffer();
  await sharp({ create: { width: 100, height: 40, channels: 3, background: '#808080' } })
    .composite([
      { input: await stripe('#c83c3c'), left: 0, top: 0 },
      { input: await stripe('#3cc83c'), left: 25, top: 0 },
      { input: await stripe('#3c3cc8'), left: 50, top: 0 },
    ])
    .png()
    .toFile(photo);
  lookup = await lookupOfPlugin(plugin, 'basic-effects');
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const render = (steps: Parameters<typeof RenderService.render>[1]) => RenderService.render(photo, steps, { lookup });

describe('basic-effects manifest', () => {
  it('is valid and has a name and description in every UI language', () => {
    const read = readManifest(__dirname);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(read.manifest.id).toBe('basic-effects');
    for (const text of [read.manifest.name, read.manifest.description]) {
      expect(Object.keys(text as object).sort()).toEqual([...LANGUAGES].sort());
    }
  });

  it('provides brightness and contrast in tuning, bw and sepia in effects, labelled in every language', async () => {
    const { filters } = await plugin.activate({} as never);
    expect(filters!.map((f) => [f.name, f.group])).toEqual([
      ['brightness', 'tuning'], ['contrast', 'tuning'], ['bw', 'effects'], ['sepia', 'effects'],
    ]);
    for (const filter of filters!) expect(Object.keys(filter.label as object).sort()).toEqual([...LANGUAGES].sort());
  });
});

describe('brightness', () => {
  it('raises the average brightness for a positive amount and lowers it for a negative one', async () => {
    const original = await stats(await render([]));
    expect((await stats(await render([{ filter: 'brightness', amount: 40 }]))).mean).toBeGreaterThan(original.mean + 5);
    expect((await stats(await render([{ filter: 'brightness', amount: -40 }]))).mean).toBeLessThan(original.mean - 5);
  });
});

describe('contrast', () => {
  it('changes nothing at 0', async () => {
    expect((await stats(await render([{ filter: 'contrast', amount: 0 }]))).values).toEqual((await stats(await render([]))).values);
  });

  it('spreads values for a positive amount and squeezes them for a negative one', async () => {
    const original = await stats(await render([]));
    expect((await stats(await render([{ filter: 'contrast', amount: 50 }]))).spread).toBeGreaterThan(original.spread);
    expect((await stats(await render([{ filter: 'contrast', amount: -50 }]))).spread).toBeLessThan(original.spread);
  });
});

describe('bw', () => {
  it('gives every pixel equal red, green and blue, and stays RGB', async () => {
    const result = await stats(await render([{ filter: 'bw' }]));
    expect(result.channels).toBe(3);
    for (const [r, g, b] of result.values) {
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
  });
});

describe('sepia', () => {
  it('gives a warm monochrome: red above green above blue, the same hue everywhere', async () => {
    const result = await stats(await render([{ filter: 'sepia' }]));
    for (const [r, g, b] of result.values) {
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('also works after another plugin made the image one-channel grey', async () => {
    const greyLookup: FilterLookup = (name) => name === 'grey'
      ? { pluginId: 'x', pluginVersion: '1', host: {} as never, definition: { name: 'grey', label: 'g', group: 'effects', params: [], render: ({ image }) => image.grayscale() } }
      : lookup(name);
    const result = await stats(await RenderService.render(photo, [{ filter: 'grey' }, { filter: 'sepia' }], { lookup: greyLookup }));
    expect(result.channels).toBe(3);
    const [r, g, b] = result.values[0];
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });
});

describe('basic-effects icons', () => {
  const host: PluginHost = { apiVersion: PLUGIN_API_VERSION, sharp, log: { info() {}, warn() {}, error() {} } };
  const iconsOf = async (folder: string, module: { activate: (host: PluginHost) => unknown }) => {
    const { filters } = await module.activate(host) as { filters: { name: string; icon?: string }[] };
    return filters.map((filter) => {
      const resolved = resolveFilterIcon(folder, filter.icon ?? '');
      if (!('file' in resolved)) throw new Error(`${filter.name}: ${resolved.problem}`);
      return [filter.name, fs.readFileSync(resolved.file, 'utf-8')] as const;
    });
  };

  it('gives every filter its own usable SVG icon, distinct across both bundled plugins', async () => {
    const own = await iconsOf(path.dirname(new URL(import.meta.url).pathname), plugin);
    const other = await iconsOf(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../basic-transforms'), await import('../basic-transforms/index.js'));
    expect(own).toHaveLength(4);
    const all = [...own, ...other];
    expect(new Set(all.map(([, svg]) => svg)).size).toBe(all.length);
    for (const [, svg] of all) expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
  });
});
