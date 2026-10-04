import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { MetadataService, gpsLocation } from './MetadataService.js';

describe('MetadataService', () => {
  let tmpFile: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_meta_test_'));
    tmpFile = path.join(tmpDir, 'dummy.txt');
    fs.writeFileSync(tmpFile, 'Hello Paloma World!');
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
    }
  });

  it('should calculate consistent xxhash for file', () => {
    const hash1 = MetadataService.calculateFileHash(tmpFile);
    const hash2 = MetadataService.calculateFileHash(tmpFile);
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });
});

/** A tiny JPEG with the given EXIF GPS block (sharp writes IFD3 as GPS; rationals as "n/d n/d n/d"). */
async function jpegWithGps(file: string, gps?: Record<string, string>): Promise<void> {
  let image = sharp({ create: { width: 8, height: 8, channels: 3, background: '#888888' } }).jpeg();
  if (gps) image = image.withExif({ IFD0: { Make: 'Test' }, IFD3: gps });
  await image.toFile(file);
}

describe('gpsLocation', () => {
  it('converts degrees, minutes and seconds to signed decimal degrees', () => {
    expect(gpsLocation({ GPSLatitudeRef: 'N', GPSLatitude: [48, 9, 39], GPSLongitudeRef: 'E', GPSLongitude: [24, 30, 1] }))
      .toEqual({ latitude: 48 + 9 / 60 + 39 / 3600, longitude: 24 + 30 / 60 + 1 / 3600 });
  });

  it('makes southern and western coordinates negative', () => {
    const location = gpsLocation({ GPSLatitudeRef: 'S', GPSLatitude: [33, 51, 21.6], GPSLongitudeRef: 'W', GPSLongitude: [74, 0, 21.6] });
    expect(location?.latitude).toBeCloseTo(-33.856, 6);
    expect(location?.longitude).toBeCloseTo(-74.006, 6);
  });

  it('accepts decimal degrees written as a single value', () => {
    expect(gpsLocation({ GPSLatitudeRef: 'N', GPSLatitude: [50.45], GPSLongitudeRef: 'E', GPSLongitude: [30.5234] }))
      .toEqual({ latitude: 50.45, longitude: 30.5234 });
  });

  it('treats a missing, malformed, out-of-range or 0,0 position as no location', () => {
    expect(gpsLocation(undefined)).toBeNull();
    expect(gpsLocation({ GPSLatitudeRef: 'N', GPSLatitude: [48, 9, 39] })).toBeNull();
    expect(gpsLocation({ GPSLatitude: [Number.NaN, 0, 0], GPSLongitude: [24, 0, 0] })).toBeNull();
    expect(gpsLocation({ GPSLatitude: [91, 0, 0], GPSLongitude: [24, 0, 0] })).toBeNull();
    expect(gpsLocation({ GPSLatitude: [0, 0, 0], GPSLongitude: [0, 0, 0] })).toBeNull();
  });
});

describe('MetadataService.extractMetadata location', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_gps_test_'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads the camera location of a JPEG', async () => {
    const file = path.join(dir, 'a.jpg');
    await jpegWithGps(file, { GPSLatitudeRef: 'N', GPSLatitude: '48/1 9/1 3899/100', GPSLongitudeRef: 'E', GPSLongitude: '24/1 30/1 1/1' });
    const meta = await MetadataService.extractMetadata(file);
    expect(meta.latitude).toBeCloseTo(48.160831, 6);
    expect(meta.longitude).toBeCloseTo(24.500278, 6);
  });

  it('reads southern and western hemispheres', async () => {
    const file = path.join(dir, 'b.jpg');
    await jpegWithGps(file, { GPSLatitudeRef: 'S', GPSLatitude: '33/1 51/1 216/10', GPSLongitudeRef: 'W', GPSLongitude: '74/1 0/1 216/10' });
    const meta = await MetadataService.extractMetadata(file);
    expect(meta.latitude).toBeCloseTo(-33.856, 6);
    expect(meta.longitude).toBeCloseTo(-74.006, 6);
  });

  it('gives no location for a photo without GPS', async () => {
    const file = path.join(dir, 'c.jpg');
    await jpegWithGps(file);
    const meta = await MetadataService.extractMetadata(file);
    expect([meta.latitude, meta.longitude]).toEqual([null, null]);
  });
});
