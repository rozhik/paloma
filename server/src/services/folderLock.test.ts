import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { lockedFolders, withFolderLock } from './folderLock.js';
import { SidecarService } from './SidecarService.js';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_lock_test_'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('withFolderLock', () => {
  it('runs calls for one folder one after another, in call order', async () => {
    const order: string[] = [];
    const job = (name: string) => withFolderLock(tmp, async () => {
      order.push(`${name} start`);
      await tick();
      order.push(`${name} end`);
    });
    await Promise.all([job('a'), job('b'), job('c')]);
    expect(order).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
  });

  it('runs calls for different folders in parallel', async () => {
    const order: string[] = [];
    const job = (dir: string) => withFolderLock(dir, async () => {
      order.push(`${path.basename(dir)} start`);
      await tick();
      order.push(`${path.basename(dir)} end`);
    });
    await Promise.all([job(path.join(tmp, 'a')), job(path.join(tmp, 'b'))]);
    expect(order.slice(0, 2).sort()).toEqual(['a start', 'b start']);
  });

  it('lets a call made while holding the lock join it instead of waiting for itself', async () => {
    const result = await withFolderLock(tmp, () => withFolderLock(tmp, async () => 'nested'));
    expect(result).toBe('nested');
  });

  it('releases the lock when the call throws', async () => {
    await expect(withFolderLock(tmp, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await withFolderLock(tmp, async () => 'next')).toBe('next');
  });

  it('leaves no entry behind once every call has settled', async () => {
    await Promise.all([1, 2, 3].map(() => withFolderLock(tmp, tick)));
    expect(lockedFolders()).toEqual([]);
  });
});

describe('concurrent sidecar changes', () => {
  it('keeps both of two changes saved at the same time in one folder', async () => {
    fs.writeFileSync(path.join(tmp, 'a.jpg'), '');
    fs.writeFileSync(path.join(tmp, 'b.jpg'), '');
    await Promise.all([
      SidecarService.updatePhotoFields(tmp, 'a.jpg', { star: true }),
      SidecarService.updatePhotoFields(tmp, 'b.jpg', { caption: 'Dusk' }),
      SidecarService.updatePhotoFields(tmp, 'a.jpg', { keywords: ['trip'] }),
    ]);
    const photos = JSON.parse(fs.readFileSync(path.join(tmp, '.paloma.json'), 'utf-8')).photos;
    expect(photos['a.jpg']).toMatchObject({ star: true, keywords: ['trip'] });
    expect(photos['b.jpg']).toMatchObject({ caption: 'Dusk' });
    expect(lockedFolders()).toEqual([]);
  });
});
