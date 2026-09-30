import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SidecarService } from './SidecarService.js';

describe('SidecarService', () => {
  let tmpFolder: string;

  beforeEach(() => {
    tmpFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_test_'));
  });

  afterEach(() => {
    fs.rmSync(tmpFolder, { recursive: true, force: true });
  });

  it('should write and read sidecar metadata file', () => {
    SidecarService.writeSidecar(tmpFolder, 'TestFolder', {
      'test.jpg': {
        is_starred: true,
        caption: 'Beautiful sunset',
        tags: ['Nature', 'Vacation'],
      },
    });

    const sidecar = SidecarService.readSidecar(tmpFolder);
    expect(sidecar).not.toBeNull();
    expect(sidecar?.folder_name).toBe('TestFolder');
    expect(sidecar?.photos['test.jpg']?.is_starred).toBe(true);
    expect(sidecar?.photos['test.jpg']?.caption).toBe('Beautiful sunset');
    expect(sidecar?.photos['test.jpg']?.tags).toEqual(['Nature', 'Vacation']);
  });

  it('should update sidecar for individual photo', () => {
    SidecarService.updatePhotoSidecar(tmpFolder, 'TestFolder', 'photo1.jpg', {
      is_starred: true,
    });

    let sidecar = SidecarService.readSidecar(tmpFolder);
    expect(sidecar?.photos['photo1.jpg']?.is_starred).toBe(true);

    SidecarService.updatePhotoSidecar(tmpFolder, 'TestFolder', 'photo1.jpg', {
      caption: 'Updated caption',
    });

    sidecar = SidecarService.readSidecar(tmpFolder);
    expect(sidecar?.photos['photo1.jpg']?.is_starred).toBe(true);
    expect(sidecar?.photos['photo1.jpg']?.caption).toBe('Updated caption');
  });
});
