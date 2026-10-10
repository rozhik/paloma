import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

/** Tail of the queue of work waiting for each folder; an entry is removed once its queue is empty. */
const queues = new Map<string, Promise<void>>();
/** Folders whose lock the current call chain holds, so a nested call for one of them runs at once. */
const held = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Runs `fn` once every earlier call for the same folder has settled, so a read-modify-write of the folder's
 * sidecar (and the library update after it) never interleaves with another one. Different folders run in
 * parallel; a call made while holding the folder's lock joins it. Calls for several folders must take the
 * locks in sorted order to avoid a deadlock.
 */
export async function withFolderLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(dir);
  const holding = held.getStore();
  if (holding?.has(key)) return fn();

  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => done);
  queues.set(key, tail);
  await previous;
  try {
    return await held.run(new Set([...(holding ?? []), key]), fn);
  } finally {
    release();
    if (queues.get(key) === tail) queues.delete(key);
  }
}

/** Folders with queued or running work; for tests. */
export function lockedFolders(): string[] {
  return [...queues.keys()];
}
