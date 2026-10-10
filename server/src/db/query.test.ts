import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { asc, eq, gt, inArray } from 'drizzle-orm';

// config.ts reads the environment at import time, so the modules are imported after PALOMA_* is set.
let tmpDir: string;
let q: typeof import('./query.js');
let db: typeof import('./index.js').db;
let folders: typeof import('./schema.js').folders;

beforeAll(async () => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paloma_query_test_')));
  vi.stubEnv('PALOMA_DATA_DIR', path.join(tmpDir, 'data'));
  vi.stubEnv('PALOMA_CACHE_DIR', path.join(tmpDir, 'cache'));
  await (await import('./index.js')).openDatabase();
  q = await import('./query.js');
  ({ db } = await import('./index.js'));
  ({ folders } = await import('./schema.js'));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  db.delete(folders).run();
});

const folder = (name: string) => ({ path: `/photos/${name}`, name, indexedAt: '' });
const names = async () => (await q.all(db.select({ name: folders.name }).from(folders).orderBy(asc(folders.name)))).map((r) => r.name);

describe('all, get, run', () => {
  it('execute the query', async () => {
    await q.run(db.insert(folders).values(folder('a')));
    expect(await q.get(db.select().from(folders).where(eq(folders.name, 'a')))).toMatchObject({ name: 'a' });
    expect(await names()).toEqual(['a']);
  });
});

describe('withTransaction', () => {
  it('commits when the function resolves', async () => {
    const result = await q.withTransaction(async (tx) => {
      await q.run(tx.insert(folders).values(folder('a')));
      await q.run(tx.insert(folders).values(folder('b')));
      return 'done';
    });
    expect(result).toBe('done');
    expect(await names()).toEqual(['a', 'b']);
  });

  it('rolls back when the function throws', async () => {
    await expect(q.withTransaction(async (tx) => {
      await q.run(tx.insert(folders).values(folder('a')));
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await names()).toEqual([]);
  });

  it('makes queries from outside wait until commit, so they never see uncommitted rows', async () => {
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => { inserted = resolve; });
    let finish!: () => void;
    const finishSignal = new Promise<void>((resolve) => { finish = resolve; });

    const transaction = q.withTransaction(async (tx) => {
      await q.run(tx.insert(folders).values(folder('a')));
      inserted();
      await finishSignal;
      await q.run(tx.insert(folders).values(folder('b')));
    });
    await insertedSignal;

    let seen: string[] | undefined;
    const outside = names().then((rows) => { seen = rows; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toBeUndefined();

    finish();
    await transaction;
    await outside;
    expect(seen).toEqual(['a', 'b']);
  });

  it('keeps a write from outside out of the open transaction', async () => {
    let inserted!: () => void;
    const insertedSignal = new Promise<void>((resolve) => { inserted = resolve; });
    const transaction = q.withTransaction(async (tx) => {
      await q.run(tx.insert(folders).values(folder('a')));
      inserted();
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error('rolled back');
    });
    await insertedSignal;
    const outside = q.run(db.insert(folders).values(folder('outside')));
    await expect(transaction).rejects.toThrow('rolled back');
    await outside;
    expect(await names()).toEqual(['outside']);
  });

  it('runs transactions one after another', async () => {
    const order: string[] = [];
    const slow = q.withTransaction(async (tx) => {
      order.push('slow start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await q.run(tx.insert(folders).values(folder('slow')));
      order.push('slow end');
    });
    const fast = q.withTransaction(async (tx) => {
      order.push('fast start');
      await q.run(tx.insert(folders).values(folder('fast')));
      order.push('fast end');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['slow start', 'slow end', 'fast start', 'fast end']);
  });

  it('joins the open transaction when called inside it', async () => {
    await expect(q.withTransaction(async (tx) => {
      await q.run(tx.insert(folders).values(folder('outer')));
      await q.withTransaction(async (inner) => {
        await q.run(inner.insert(folders).values(folder('inner')));
      });
      throw new Error('undo both');
    })).rejects.toThrow('undo both');
    expect(await names()).toEqual([]);
  });
});

describe('eachBatch', () => {
  const pages = (size: number) => q.eachBatch(size, (afterId, limit) =>
    db.select({ id: folders.id, name: folders.name }).from(folders).where(gt(folders.id, afterId)).orderBy(asc(folders.id)).limit(limit));

  async function collect(size: number): Promise<number[]> {
    const sizes: number[] = [];
    for await (const page of pages(size)) sizes.push(page.length);
    return sizes;
  }

  it('yields nothing for an empty table', async () => {
    expect(await collect(2)).toEqual([]);
  });

  it('yields full pages and a last partial one', async () => {
    db.insert(folders).values(['a', 'b', 'c', 'd', 'e'].map(folder)).run();
    expect(await collect(2)).toEqual([2, 2, 1]);
  });

  it('stops after a full last page when the table is an exact multiple of the batch size', async () => {
    db.insert(folders).values(['a', 'b', 'c', 'd'].map(folder)).run();
    expect(await collect(2)).toEqual([2, 2]);
  });

  it('includes rows inserted during the walk, without repeating any', async () => {
    db.insert(folders).values(['a', 'b', 'c'].map(folder)).run();
    const seen: string[] = [];
    for await (const page of pages(2)) {
      seen.push(...page.map((row) => row.name));
      if (seen.length === 2) await q.run(db.insert(folders).values(folder('late')));
    }
    expect(seen).toEqual(['a', 'b', 'c', 'late']);
  });
});

describe('chunked', () => {
  it('passes slices of at most the given size and concatenates the results', async () => {
    const calls: number[][] = [];
    const result = await q.chunked([1, 2, 3, 4, 5], 2, async (chunk) => {
      calls.push(chunk);
      return chunk.map((n) => n * 10);
    });
    expect(calls).toEqual([[1, 2], [3, 4], [5]]);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('queries an id list longer than SQLite allows parameters', async () => {
    db.insert(folders).values(['a', 'b'].map(folder)).run();
    const ids = (await q.all(db.select({ id: folders.id }).from(folders))).map((r) => r.id);
    const many = [...Array.from({ length: 40_000 }, (_, i) => 1_000_000 + i), ...ids];
    await expect(q.all(db.select().from(folders).where(inArray(folders.id, many)))).rejects.toThrow();
    const found = await q.chunked(many, q.BATCH_SIZE, (chunk) => q.all(db.select().from(folders).where(inArray(folders.id, chunk))));
    expect(found.map((row) => row.name).sort()).toEqual(['a', 'b']);
  });
});
