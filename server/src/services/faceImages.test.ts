import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

let tmpDir: string;
let faces: typeof import('./faceImages.js');

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_faces_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  vi.stubEnv('PALOMA_PHOTOS_DIRS', '');
  vi.stubEnv('PALOMA_EXCLUDE_DIRS', '');
  faces = await import('./faceImages.js');
  fs.mkdirSync(path.join(tmpDir, 'cache'), { recursive: true });
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** A 200×100 JPEG, red on the left half and blue on the right, stored with EXIF orientation 6 (shown 100×200). */
async function rotatedImage(file: string): Promise<void> {
  const half = (r: number, b: number) => ({ create: { width: 100, height: 100, channels: 3 as const, background: { r, g: 0, b } } });
  const left = await sharp(half(255, 0)).png().toBuffer();
  const right = await sharp(half(0, 255)).png().toBuffer();
  await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 100, top: 0 }])
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 95 })
    .toFile(file);
}

async function pixel(file: string, x: number, y: number): Promise<{ r: number; b: number }> {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], b: data[i + 2] };
}

describe('faceCropBox', () => {
  it('adds a margin around the face and makes the crop square', () => {
    // face 100×50 px at (100, 100) in a 1000×1000 image: side 100 × 1.4 = 140, centred on (150, 125)
    expect(faces.faceCropBox({ left: 0.1, top: 0.1, right: 0.2, bottom: 0.15 }, 1000, 1000))
      .toEqual({ left: 80, top: 55, width: 140, height: 140 });
  });

  it('moves the crop inside the image at an edge', () => {
    expect(faces.faceCropBox({ left: 0, top: 0, right: 0.1, bottom: 0.1 }, 1000, 1000))
      .toEqual({ left: 0, top: 0, width: 140, height: 140 });
    expect(faces.faceCropBox({ left: 0.9, top: 0.9, right: 1, bottom: 1 }, 1000, 1000))
      .toEqual({ left: 860, top: 860, width: 140, height: 140 });
  });

  it('shrinks the crop to the image when the face fills it, keeping it centred', () => {
    expect(faces.faceCropBox({ left: 0, top: 0, right: 1, bottom: 1 }, 400, 300))
      .toEqual({ left: 50, top: 0, width: 300, height: 300 });
  });
});

describe('parseRectQuery', () => {
  it('reads four fractions in order', () => {
    expect(faces.parseRectQuery('0.1,0.2,0.3,0.4')).toEqual({ left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 });
    expect(faces.parseRectQuery('0.3,0.2,0.1,0.4')).toBeUndefined();
    expect(faces.parseRectQuery('0.1,0.2,0.3')).toBeUndefined();
    expect(faces.parseRectQuery('0.1,0.2,0.3,1.5')).toBeUndefined();
  });
});

describe('renders', () => {
  it('turns the detection image upright', async () => {
    const file = path.join(tmpDir, 'rotated.jpg');
    await rotatedImage(file);

    const out = await faces.renderFaceSource(file, 'rotated');

    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([100, 200]);
    expect((await pixel(out, 50, 20)).r).toBeGreaterThan(200); // the red half is on top
    expect((await pixel(out, 50, 180)).b).toBeGreaterThan(200);
  });

  it('crops faces in the upright frame', async () => {
    const file = path.join(tmpDir, 'rotated.jpg');
    await rotatedImage(file);

    const bottom = await faces.renderFaceCrop(file, 'rotated', { left: 0.3, top: 0.7, right: 0.7, bottom: 0.9 }, 64);

    const meta = await sharp(bottom).metadata();
    expect([meta.width, meta.height]).toEqual([64, 64]);
    expect((await pixel(bottom, 32, 32)).b).toBeGreaterThan(200);
  });
});
