import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { faceDetector, toFaceInput } from './detector.js';

describe('face detector', () => {
  it('turns a detection in pixels into fractions of the image, clipped to it', () => {
    expect(toFaceInput({ x: -10, y: 20, width: 60, height: 40 }, 1.2, [0.5, -0.5], { width: 100, height: 200 })).toEqual({
      rect: { left: 0, top: 0.1, right: 0.5, bottom: 0.3 }, score: 1, descriptor: [0.5, -0.5],
    });
  });

  it('loads face-api on WebAssembly in the server and finds no face on a plain image', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_detector_test_'));
    const file = path.join(dir, 'plain.jpg');
    await sharp({ create: { width: 320, height: 240, channels: 3, background: '#88aacc' } }).jpeg().toFile(file);
    try {
      await faceDetector.prepare();
      expect(await faceDetector.detect(file)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
