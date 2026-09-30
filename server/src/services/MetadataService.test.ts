import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MetadataService } from './MetadataService.js';

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
