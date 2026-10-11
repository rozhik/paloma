import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { prepareImage } from './image.js';

let tmp: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_ai_image_test_'));
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('prepareImage', () => {
  it('sends the photo upright and resized to the long edge', async () => {
    // Stored 400×200 and marked "rotate 90° clockwise": the photo is 200×400 when shown
    const file = path.join(tmp, 'rotated.jpg');
    await sharp({ create: { width: 400, height: 200, channels: 3, background: '#336699' } }).jpeg().withMetadata({ orientation: 6 }).toFile(file);
    const image = await prepareImage(file, 256);
    expect([image.width, image.height, image.mimeType]).toEqual([128, 256, 'image/jpeg']);
    const meta = await sharp(image.data).metadata();
    expect([meta.format, meta.width, meta.height, meta.orientation ?? 1]).toEqual(['jpeg', 128, 256, 1]);
  });

  it('does not enlarge a small photo', async () => {
    const file = path.join(tmp, 'small.png');
    await sharp({ create: { width: 120, height: 80, channels: 3, background: '#ffffff' } }).png().toFile(file);
    const image = await prepareImage(file, 1024);
    expect([image.width, image.height]).toEqual([120, 80]);
  });
});
