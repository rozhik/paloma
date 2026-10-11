import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase } from './testing.js';

let tmpDir: string;
let cleanup: () => void;
let quotas: typeof import('./quotas.js');
let db: typeof import('../db/index.js').db;
let schema: typeof import('../db/schema.js');

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_quotas_test_', { PALOMA_RATE_LIMIT: '300' }));
  quotas = await import('./quotas.js');
  ({ db } = await import('../db/index.js'));
  schema = await import('../db/schema.js');
  db.insert(schema.users).values({ id: 'u1', username: 'ben', usernameKey: 'ben', displayName: 'Ben', roleId: 'viewer', createdAt: '' }).run();
});

afterAll(() => cleanup());

describe('quota limits', () => {
  it('are unlimited and the default rate until set', async () => {
    expect(await quotas.quotaLimits('u1')).toEqual({ export_bytes: null, requests_per_minute: null });
    expect(await quotas.quotaInfos('u1', 'ben')).toEqual([
      { kind: 'export_bytes', limit: null, effectiveLimit: null, used: 0 },
      { kind: 'requests_per_minute', limit: null, effectiveLimit: 300 },
    ]);
  });

  it('are stored by kind and keep kinds not given', async () => {
    await quotas.setQuotaLimits('u1', { export_bytes: 500 });
    await quotas.setQuotaLimits('u1', { requests_per_minute: 0 });
    expect(await quotas.quotaLimits('u1')).toEqual({ export_bytes: 500, requests_per_minute: 0 });
    // 0 requests per minute is unlimited
    expect((await quotas.quotaInfos('u1', 'ben'))[1].effectiveLimit).toBeNull();
    await quotas.setQuotaLimits('u1', { export_bytes: null });
    expect((await quotas.quotaLimits('u1')).export_bytes).toBeNull();
  });

  it('refuses invalid limits', () => {
    for (const value of [{ export_bytes: -1 }, { export_bytes: 1.5 }, { uploads: 3 }, [], 'x']) {
      expect(() => quotas.parseQuotaLimits(value), JSON.stringify(value)).toThrow();
    }
    expect(quotas.parseQuotaLimits({ export_bytes: 10, requests_per_minute: null })).toEqual({ export_bytes: 10, requests_per_minute: null });
  });
});

describe('export usage', () => {
  it('is the size of the files in the user export folder, with subfolders', async () => {
    const root = quotas.userExportDir('ben');
    expect(root).toBe(path.join(tmpDir, 'export', 'ben'));
    fs.mkdirSync(path.join(root, 'trip', 'day1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'a.jpg'), Buffer.alloc(100));
    fs.writeFileSync(path.join(root, 'trip', 'day1', 'b.jpg'), Buffer.alloc(250));
    expect(await quotas.folderSize(root)).toBe(350);
    expect(await quotas.folderSize(path.join(tmpDir, 'missing'))).toBe(0);
    expect((await quotas.quotaInfos('u1', 'ben'))[0].used).toBe(350);
  });
});
