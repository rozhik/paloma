import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import type { RegisteredFilter } from '../plugins/registry.js';
import type { FilterDefinition, PluginHost } from '../plugins/api.js';
import { RenderService } from './RenderService.js';

let tmp: string;
let quadrants: string;

const RED = { r: 255, g: 0, b: 0 };
const GREEN = { r: 0, g: 255, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const WHITE = { r: 255, g: 255, b: 255 };

const host = { apiVersion: 1, sharp, log: { info() {}, warn() {}, error() {} } } as PluginHost;

const registered = (definition: Omit<FilterDefinition, 'label' | 'group'> & { params?: FilterDefinition['params'] }): RegisteredFilter => ({
  pluginId: 'test',
  pluginVersion: '1.0.0',
  definition: { label: definition.name, group: 'basic', ...definition, params: definition.params ?? [] },
  host,
});

const FILTERS = new Map<string, RegisteredFilter>([
  ['crop64', registered({
    name: 'crop64',
    params: [{ name: 'rect', label: 'Frame', type: 'rect', default: { left: 0, top: 0, right: 1, bottom: 1 } }],
    render: ({ image, width, height, params }) => {
      const rect = params.rect as { left: number; top: number; right: number; bottom: number };
      const left = Math.round(rect.left * width);
      const top = Math.round(rect.top * height);
      return image.extract({ left, top, width: Math.round(rect.right * width) - left, height: Math.round(rect.bottom * height) - top });
    },
  })],
  ['rotate', registered({ name: 'rotate', render: ({ image }) => image.rotate(90) })],
  ['bw', registered({ name: 'bw', render: ({ image }) => image.grayscale() })],
  ['throws', registered({ name: 'throws', render: () => { throw new Error('boom'); } })],
  ['not-sharp', registered({ name: 'not-sharp', render: () => 'nope' as unknown as sharp.Sharp })],
  ['slow', registered({ name: 'slow', render: () => new Promise<sharp.Sharp>(() => {}) })],
]);
const lookup = (name: string) => FILTERS.get(name);

/** 40×20 image: left half red, right half blue, with a green top-left quarter. */
async function makeQuadrants(file: string): Promise<void> {
  const block = (w: number, h: number, colour: typeof RED) => sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();
  await sharp({ create: { width: 40, height: 20, channels: 3, background: BLUE } })
    .composite([
      { input: await block(20, 20, RED), left: 0, top: 0 },
      { input: await block(20, 10, GREEN), left: 0, top: 0 },
    ])
    .png()
    .toFile(file);
}

async function pixel(image: sharp.Sharp, x: number, y: number) {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return { width: info.width, height: info.height, rgb: [data[at], data[at + 1], data[at + 2]] };
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_render_test_'));
  quadrants = path.join(tmp, 'quadrants.png');
  await makeQuadrants(quadrants);
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

let errors: MockInstance<Parameters<Console['error']>, void>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const LEFT_HALF = { filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } };

describe('RenderService.render', () => {
  it('returns the original without edits', async () => {
    const result = await pixel(await RenderService.render(quadrants, [], { lookup }), 30, 15);
    expect(result).toMatchObject({ width: 40, height: 20, rgb: [BLUE.r, BLUE.g, BLUE.b] });
  });

  it('applies steps in order: crop then rotate differs from rotate then crop', async () => {
    const cropThenRotate = await RenderService.render(quadrants, [LEFT_HALF, { filter: 'rotate' }], { lookup });
    const rotateThenCrop = await RenderService.render(quadrants, [{ filter: 'rotate' }, LEFT_HALF], { lookup });

    // Left half (red with green top) turned clockwise: 20×20, green on the right
    expect(await pixel(cropThenRotate, 15, 5)).toMatchObject({ width: 20, height: 20, rgb: [0, 255, 0] });
    // Whole image turned (20×40), then its left half: 10×40, red on top (the old bottom left), blue below
    expect(await pixel(rotateThenCrop, 5, 5)).toMatchObject({ width: 10, height: 40, rgb: [255, 0, 0] });
    expect(await pixel(rotateThenCrop, 5, 30)).toMatchObject({ rgb: [0, 0, 255] });
  });

  it('skips disabled steps, unknown filters and invalid parameters', async () => {
    const result = await RenderService.render(quadrants, [
      { filter: 'bw', enabled: false },
      { filter: 'grain', amount: 3 },
      { filter: 'crop64', rect: { left: 0.6, top: 0, right: 0.2, bottom: 1 } },
    ], { lookup });
    expect(await pixel(result, 30, 15)).toMatchObject({ width: 40, height: 20, rgb: [BLUE.r, BLUE.g, BLUE.b] });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('Skipping filter crop64'));
  });

  it('skips a failing filter, logs the photo and filter, and applies the rest', async () => {
    const result = await RenderService.render(quadrants, [{ filter: 'throws' }, { filter: 'not-sharp' }, LEFT_HALF], {
      lookup,
      label: '/photos/a.jpg',
    });
    expect(await pixel(result, 5, 15)).toMatchObject({ width: 20, height: 20, rgb: [255, 0, 0] });
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/Filter throws .*\/photos\/a\.jpg.*boom/));
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/Filter not-sharp .*did not return a sharp image/));
  });

  it('skips a step that takes too long', async () => {
    const result = await RenderService.render(quadrants, [{ filter: 'slow' }, LEFT_HALF], { lookup, stepTimeoutMs: 50 });
    expect((await pixel(result, 0, 0)).width).toBe(20);
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/Filter slow .*longer than/));
  });

  it('runs the chain on a downscaled image within the working size', async () => {
    const big = path.join(tmp, 'big.png');
    await sharp({ create: { width: 4000, height: 3000, channels: 3, background: WHITE } }).png().toFile(big);
    const result = await RenderService.render(big, [{ filter: 'rotate' }], { lookup, workingSize: 1800 });
    const { width, height } = await pixel(result, 0, 0);
    expect([width, height]).toEqual([1350, 1800]);
  });

  it('gives black & white results with equal channels', async () => {
    const result = await RenderService.render(quadrants, [{ filter: 'bw' }], { lookup });
    const { data, info } = await result.toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i]).toBe(data[i + 2]);
    }
  });
});

describe('RenderService.workingSizeFor', () => {
  it('renders 1.5 times the shown size, at least 400', () => {
    expect(RenderService.workingSizeFor(1200)).toBe(1800);
    expect(RenderService.workingSizeFor(100)).toBe(400);
  });
});
