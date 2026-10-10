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
let lookup: FilterLookup;

/** A PNG whose pixel at (x, y) has red = x mod 256 and green = y mod 256, so positions can be read back. */
async function coordinateImage(file: string, width: number, height: number): Promise<void> {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 3;
      data[at] = x % 256;
      data[at + 1] = y % 256;
      data[at + 2] = 0;
    }
  }
  await sharp(data, { raw: { width, height, channels: 3 } }).png().toFile(file);
}

async function pixels(image: sharp.Sharp) {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    at: (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [...data.subarray(i, i + 3)];
    },
  };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_basic_transforms_'));
  lookup = await lookupOfPlugin(plugin, 'basic-transforms');
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('basic-transforms manifest', () => {
  it('is valid and has a name and description in every UI language', async () => {
    const read = await readManifest(__dirname);
    expect(read.kind).toBe('ok');
    if (read.kind !== 'ok') return;
    expect(read.manifest.id).toBe('basic-transforms');
    for (const text of [read.manifest.name, read.manifest.description]) {
      expect(Object.keys(text as object).sort()).toEqual([...LANGUAGES].sort());
    }
  });

  it('labels every filter in every UI language', async () => {
    const { filters } = await plugin.activate({} as never);
    expect(filters!.map((f) => [f.name, f.group])).toEqual([['crop64', 'basic'], ['rotate', 'basic'], ['flip', 'basic'], ['straighten', 'basic']]);
    for (const filter of filters!) expect(Object.keys(filter.label as object).sort()).toEqual([...LANGUAGES].sort());
  });
});

describe('crop64', () => {
  it('keeps the part inside the rectangle', async () => {
    const file = path.join(tmp, 'coords.png');
    await coordinateImage(file, 1000, 800);
    const result = await pixels(await RenderService.render(file, [
      { filter: 'crop64', rect: { left: 0.1, top: 0.25, right: 0.9, bottom: 0.75 } },
    ], { lookup }));
    expect([result.width, result.height]).toEqual([800, 400]);
    expect(result.at(0, 0)).toEqual([100, 200, 0]);
  });
});

describe('rotate', () => {
  it('turns the image clockwise by a quarter', async () => {
    const file = path.join(tmp, 'wide.png');
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#fff' } })
      .composite([{ input: await sharp({ create: { width: 10, height: 10, channels: 3, background: '#f00' } }).png().toBuffer(), left: 0, top: 0 }])
      .png()
      .toFile(file);
    const result = await pixels(await RenderService.render(file, [{ filter: 'rotate', angle: 90 }], { lookup }));
    expect([result.width, result.height]).toEqual([300, 400]);
    // The red top-left corner is now top-right
    expect(result.at(295, 5)).toEqual([255, 0, 0]);
  });
});

describe('flip', () => {
  it('mirrors left to right, moving a mark on the left to the right', async () => {
    const file = path.join(tmp, 'tree.png');
    await sharp({ create: { width: 100, height: 50, channels: 3, background: '#fff' } })
      .composite([{ input: await sharp({ create: { width: 10, height: 50, channels: 3, background: '#0a0' } }).png().toBuffer(), left: 0, top: 0 }])
      .png()
      .toFile(file);
    const result = await pixels(await RenderService.render(file, [{ filter: 'flip', direction: 'horizontal' }], { lookup }));
    expect(result.at(95, 25)).toEqual([0, 170, 0]);
    expect(result.at(5, 25)).toEqual([255, 255, 255]);
  });

  it('mirrors top to bottom', async () => {
    const file = path.join(tmp, 'coords-small.png');
    await coordinateImage(file, 20, 10);
    const result = await pixels(await RenderService.render(file, [{ filter: 'flip', direction: 'vertical' }], { lookup }));
    expect(result.at(3, 0)).toEqual([3, 9, 0]);
  });
});

describe('straighten', () => {
  it('turns by the angle and keeps the aspect ratio without blank corners', async () => {
    const file = path.join(tmp, 'white.png');
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#fff' } }).png().toFile(file);
    const result = await pixels(await RenderService.render(file, [{ filter: 'straighten', angle: 3 }], { lookup }));
    expect(result.width / result.height).toBeCloseTo(4 / 3, 1);
    expect(result.width).toBeLessThan(400);
    expect(result.channels).toBe(3);
    for (const [x, y] of [[0, 0], [result.width - 1, 0], [0, result.height - 1], [result.width - 1, result.height - 1]]) {
      expect(result.at(x, y)).toEqual([255, 255, 255]);
    }
  });

  it('turns clockwise for a positive angle', async () => {
    const file = path.join(tmp, 'line.png');
    // A dark horizontal line through the middle
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#fff' } })
      .composite([{ input: await sharp({ create: { width: 400, height: 6, channels: 3, background: '#000' } }).png().toBuffer(), left: 0, top: 147 }])
      .png()
      .toFile(file);
    const result = await pixels(await RenderService.render(file, [{ filter: 'straighten', angle: 10 }], { lookup }));
    const darkestRow = (x: number) => {
      let best = 0;
      for (let y = 1; y < result.height; y += 1) if (result.at(x, y)[0] < result.at(x, best)[0]) best = y;
      return best;
    };
    // Clockwise: the line goes down to the right
    expect(darkestRow(result.width - 20)).toBeGreaterThan(darkestRow(20));
  });

  it('leaves the image unchanged at 0', async () => {
    const file = path.join(tmp, 'zero.png');
    await coordinateImage(file, 40, 30);
    const result = await pixels(await RenderService.render(file, [{ filter: 'straighten', angle: 0 }], { lookup }));
    expect([result.width, result.height]).toEqual([40, 30]);
  });
});

describe('straightenScale', () => {
  it('is 1 without a turn and shrinks as the angle grows', () => {
    expect(plugin.straightenScale(4000, 3000, 0)).toBe(1);
    expect(plugin.straightenScale(4000, 3000, 3)).toBeLessThan(1);
    expect(plugin.straightenScale(4000, 3000, 10)).toBeLessThan(plugin.straightenScale(4000, 3000, 3));
    expect(plugin.straightenScale(4000, 3000, -3)).toBe(plugin.straightenScale(4000, 3000, 3));
  });
});

describe('basic-transforms icons', () => {
  const host: PluginHost = { apiVersion: PLUGIN_API_VERSION, sharp, log: { info() {}, warn() {}, error() {} } };
  const iconsOf = async (folder: string, module: { activate: (host: PluginHost) => unknown }) => {
    const { filters } = await module.activate(host) as { filters: { name: string; icon?: string }[] };
    return Promise.all(filters.map(async (filter) => {
      const resolved = await resolveFilterIcon(folder, filter.icon ?? '');
      if (!('file' in resolved)) throw new Error(`${filter.name}: ${resolved.problem}`);
      return [filter.name, fs.readFileSync(resolved.file, 'utf-8')] as const;
    }));
  };

  it('gives every filter its own usable SVG icon, distinct across both bundled plugins', async () => {
    const own = await iconsOf(path.dirname(new URL(import.meta.url).pathname), plugin);
    const other = await iconsOf(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../basic-effects'), await import('../basic-effects/index.js'));
    expect(own).toHaveLength(4);
    const all = [...own, ...other];
    expect(new Set(all.map(([, svg]) => svg)).size).toBe(all.length);
    for (const [, svg] of all) expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
  });
});
