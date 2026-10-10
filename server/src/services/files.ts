import fs from 'node:fs';
import path from 'node:path';

/** Whether something exists at `filePath`, as `fs.existsSync` answers it, without blocking. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const created = new Map<string, Promise<void>>();

/** Creates a directory (and its parents) once per process; later calls wait for the first one. */
export function ensureDir(dir: string): Promise<void> {
  const key = path.resolve(dir);
  let pending = created.get(key);
  if (!pending) {
    pending = fs.promises.mkdir(key, { recursive: true }).then(() => undefined);
    // A failed attempt is retried by the next caller
    pending.catch(() => created.delete(key));
    created.set(key, pending);
  }
  return pending;
}
