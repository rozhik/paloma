import { AsyncLocalStorage } from 'node:async_hooks';
import { connection, db, type Db } from './index.js';

/**
 * The only way services run queries: `await all(db.select()…)`. Each helper waits while a transaction of
 * another caller is open, then executes. On SQLite the builders run synchronously on one connection; another
 * backend implements these helpers by awaiting the builder, without changes to the services.
 */

/** An open transaction; `open` turns false at commit or rollback, so late callbacks no longer pass the gate. */
interface TxContext {
  open: boolean;
}

const context = new AsyncLocalStorage<TxContext>();

/** Settles when the open transaction ends; null while none is open. */
let current: Promise<void> | null = null;
/** Tail of the queue of transactions waiting for the connection. */
let queue: Promise<void> = Promise.resolve();

const insideTransaction = (): boolean => context.getStore()?.open === true;

/**
 * Whether a transaction of another caller is open. Checked right before executing, with no await in between:
 * a transaction can begin while a waiting caller resumes.
 */
const blocked = (): boolean => current !== null && !insideTransaction();

export async function all<R>(query: { all(): R }): Promise<R> {
  while (blocked()) await current;
  return query.all();
}

export async function get<R>(query: { get(): R }): Promise<R> {
  while (blocked()) await current;
  return query.get();
}

export async function run<R>(query: { run(): R }): Promise<R> {
  while (blocked()) await current;
  return query.run();
}

/**
 * Runs `fn` in a transaction: committed when it resolves, rolled back when it throws. Other callers' queries
 * wait until it ends. A call inside an open transaction joins it. `fn` gets the database to query through;
 * on SQLite that is `db` itself, but callers must use the `tx` given so another backend can pass its own.
 * Keep file I/O out of `fn`: the connection is held for the whole call.
 */
export async function withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  if (insideTransaction()) return fn(db);

  const previous = queue;
  let release!: () => void;
  const done = new Promise<void>((resolve) => { release = resolve; });
  queue = previous.then(() => done);
  await previous;

  const tx: TxContext = { open: true };
  current = done;
  const sqlite = connection();
  try {
    sqlite.exec('BEGIN IMMEDIATE');
    const result = await context.run(tx, () => fn(db));
    sqlite.exec('COMMIT');
    return result;
  } catch (err) {
    if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
    throw err;
  } finally {
    tx.open = false;
    current = null;
    release();
  }
}

/** Lets pending I/O and timers run before a long job continues. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export const BATCH_SIZE = 500;

/**
 * Reads a table in pages ordered by id: `page(afterId, size)` must select rows with `id > afterId`, ordered
 * by id, at most `size` of them. Yields each non-empty page and lets the event loop run between pages.
 */
export async function* eachBatch<R extends { id: number }>(
  size: number,
  page: (afterId: number, size: number) => { all(): R[] },
): AsyncGenerator<R[]> {
  let afterId = Number.MIN_SAFE_INTEGER;
  for (;;) {
    const rows = await all(page(afterId, size));
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < size) return;
    afterId = rows[rows.length - 1].id;
    await yieldToEventLoop();
  }
}

/**
 * Runs `fn` on consecutive slices of at most `size` items and concatenates the results, so `inArray` never
 * gets more parameters than a database allows.
 */
export async function chunked<T, R>(items: readonly T[], size: number, fn: (chunk: T[]) => Promise<R[] | void>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const part = await fn(items.slice(i, i + size));
    if (part) results.push(...part);
  }
  return results;
}
