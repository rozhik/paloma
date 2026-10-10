import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import type { RegisteredFilter } from '../plugins/registry.js';

// config.ts reads the environment at import time, so the service is imported after it points at a temp folder
let tmp: string;
let photo: { filePath: string; fileHash: string };
let Thumbnails: typeof import('./ThumbnailService.js').ThumbnailService;
let renders = 0;

const bw: RegisteredFilter = {
  pluginId: 'basic-effects',
  pluginVersion: '1.0.0',
  definition: {
    name: 'bw', label: 'B&W', group: 'effects', params: [],
    render: ({ image }) => {
      renders += 1;
      return image.grayscale();
    },
  },
  host: {} as RegisteredFilter['host'],
};
const lookup = (name: string) => (name === 'bw' ? bw : undefined);

beforeAll(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_thumbs_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmp, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmp, 'cache'));
  await (await import('../db/index.js')).openDatabase();
  ({ ThumbnailService: Thumbnails } = await import('./ThumbnailService.js'));

  const filePath = path.join(tmp, 'a.jpg');
  await sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 40, b: 40 } } }).jpeg().toFile(filePath);
  photo = { filePath, fileHash: 'hash1' };
});

afterAll(async () => {
  vi.unstubAllEnvs();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ThumbnailService.getImage', () => {
  it('serves the scanner thumbnail for a photo without effective edits', async () => {
    const file = await Thumbnails.getImage(photo, [{ filter: 'grain' }], 'thumb', lookup);
    expect(file).toBe(Thumbnails.getThumbnailPath('hash1', 'thumb'));
    expect(fs.existsSync(file)).toBe(true);
    expect(renders).toBe(0);
  });

  it('renders an edited image once for concurrent requests and caches it', async () => {
    const [a, b] = await Promise.all([
      Thumbnails.getImage(photo, [{ filter: 'bw' }], 'preview', lookup),
      Thumbnails.getImage(photo, [{ filter: 'bw' }], 'preview', lookup),
    ]);
    expect(a).toBe(b);
    expect(path.basename(a)).toMatch(/^hash1_[0-9a-f]{12}_preview\.webp$/);
    expect(renders).toBe(1);

    await Thumbnails.getImage(photo, [{ filter: 'bw' }], 'preview', lookup);
    expect(renders).toBe(1);

    const { data, info } = await sharp(a).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([600, 400]);
    expect(Math.abs(data[0] - data[1])).toBeLessThan(3);
  });

  it('renders thumbnails at 250×250', async () => {
    const file = await Thumbnails.getImage(photo, [{ filter: 'bw' }], 'thumb', lookup);
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([250, 250]);
  });
});
