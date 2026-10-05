import { describe, it, expect, vi } from 'vitest';
import type { EditStep, Photo } from '../../../../shared/types.js';
import { PhotoSaveQueue, ViewerEditSession } from './saveQueue.js';

/** A fake `savePhotoEdits` whose requests the test resolves or rejects one by one; resolved chains are kept. */
function fakeServer() {
  const stored: Record<number, EditStep[]> = {};
  const calls: { photoId: number; steps: EditStep[]; resolve: () => void; reject: (err: unknown) => void }[] = [];
  const save = vi.fn((photoId: number, steps: EditStep[]) => new Promise<Photo>((resolve, reject) => {
    calls.push({
      photoId,
      steps,
      resolve: () => {
        stored[photoId] = steps;
        resolve({ id: photoId, edits: steps.length ? steps : null } as Photo);
      },
      reject,
    });
  }));
  return { calls, save, stored };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const photo = (id: number, edits: EditStep[] | null = null) => ({ id, edits }) as Photo;
const newSession = (server: ReturnType<typeof fakeServer>) => new ViewerEditSession(server.save, () => {}, () => {});
const SEPIA: EditStep = { filter: 'sepia' };
const BW: EditStep = { filter: 'bw' };
const ROTATED: EditStep = { filter: 'rotate', angle: 90 };

describe('PhotoSaveQueue', () => {
  it('sends nothing when the steps are what is saved', () => {
    const server = fakeServer();
    const queue = new PhotoSaveQueue([SEPIA], (s) => server.save(1, s), () => {}, () => {});
    queue.request([SEPIA]);
    expect(server.save).not.toHaveBeenCalled();
    expect(queue.status).toBe('saved');
  });

  it('keeps one request in flight and sends the latest steps last', async () => {
    const server = fakeServer();
    const saved = vi.fn();
    const queue = new PhotoSaveQueue([], (s) => server.save(1, s), () => {}, saved);
    queue.request([SEPIA]);
    queue.request([SEPIA, BW]);
    queue.request([BW]);
    expect(server.calls.map((c) => c.steps)).toEqual([[SEPIA]]);

    server.calls[0].resolve();
    await flush();
    expect(server.calls.map((c) => c.steps)).toEqual([[SEPIA], [BW]]);

    server.calls[1].resolve();
    await flush();
    expect(queue.status).toBe('saved');
    expect(queue.saved).toEqual([BW]);
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it('keeps the wanted steps after a failure and saves them on retry', async () => {
    const server = fakeServer();
    const queue = new PhotoSaveQueue([], (s) => server.save(1, s), () => {}, () => {});
    queue.request([SEPIA]);
    server.calls[0].reject(new Error('disk full'));
    expect(await queue.idle()).toBe('failed');
    expect(queue.error).toEqual(new Error('disk full'));
    expect(queue.saved).toEqual([]);

    queue.retry();
    expect(server.calls[1].steps).toEqual([SEPIA]);
    server.calls[1].resolve();
    expect(await queue.idle()).toBe('saved');
  });

  it('waits for the save in flight before reporting idle', async () => {
    const server = fakeServer();
    const queue = new PhotoSaveQueue([], (s) => server.save(1, s), () => {}, () => {});
    queue.request([SEPIA]);
    let done = false;
    const idle = queue.idle().then((status) => { done = true; return status; });
    await flush();
    expect(done).toBe(false);
    server.calls[0].resolve();
    expect(await idle).toBe('saved');
  });
});

describe('ViewerEditSession', () => {
  it('saves finished changes but not a slider that is still moving', async () => {
    const server = fakeServer();
    const session = newSession(server);
    const a = photo(1);
    session.dispatch(a, { type: 'apply', filter: 'brightness', params: { amount: 10 } });
    session.dispatch(a, { type: 'apply', filter: 'brightness', params: { amount: 30 } });
    expect(server.save).not.toHaveBeenCalled();

    session.dispatch(a, { type: 'commit' });
    expect(server.calls.map((c) => c.steps)).toEqual([[{ filter: 'brightness', amount: 30 }]]);
    server.calls[0].resolve();
    await flush();

    session.dispatch(a, { type: 'commit' });
    expect(server.save).toHaveBeenCalledTimes(1);
  });

  it('saves an undo like any change', async () => {
    const server = fakeServer();
    const session = newSession(server);
    const a = photo(1, [SEPIA, BW]);
    session.dispatch(a, { type: 'undo' });
    expect(server.calls[0].steps).toEqual([SEPIA]);
  });

  it('undoes steps saved before the viewer was opened, down to the original', async () => {
    const server = fakeServer();
    const first = newSession(server);
    const step = async (session: ViewerEditSession, p: Photo, action: Parameters<ViewerEditSession['dispatch']>[1]) => {
      session.dispatch(p, action);
      server.calls[server.calls.length - 1].resolve();
      await flush();
    };
    await step(first, photo(1), { type: 'rotate', delta: 90 });
    await step(first, photo(1), { type: 'apply', filter: 'sepia', params: {} });
    await step(first, photo(1), { type: 'commit' });
    expect(server.stored[1]).toEqual([ROTATED, SEPIA]);

    // The viewer closes; a new one opens the photo as it was saved
    const second = newSession(server);
    const reopened = photo(1, server.stored[1]);
    await step(second, reopened, { type: 'undo' });
    await step(second, reopened, { type: 'undo' });
    expect(server.stored[1]).toEqual([]);
    expect(second.chain(reopened).steps).toEqual([]);
  });

  it('keeps each photo’s chain apart', async () => {
    const server = fakeServer();
    const session = newSession(server);
    const a = photo(1);
    const b = photo(2);
    session.dispatch(a, { type: 'apply', filter: 'sepia', params: {} });
    session.dispatch(a, { type: 'commit' });
    server.calls[0].resolve();
    await flush();
    session.dispatch(b, { type: 'rotate', delta: -90 });
    server.calls[1].resolve();
    await flush();

    session.dispatch(a, { type: 'undo' });
    expect(session.chain(a).steps).toEqual([]);
    expect(server.calls[2]).toMatchObject({ photoId: 1, steps: [] });
    expect(session.chain(b).steps).toEqual([{ filter: 'rotate', angle: 270 }]);
  });

  it('discards an unsaved change after a failure', async () => {
    const server = fakeServer();
    const session = newSession(server);
    const a = photo(1, [BW]);
    session.dispatch(a, { type: 'apply', filter: 'sepia', params: {} });
    session.dispatch(a, { type: 'commit' });
    server.calls[0].reject(new Error('unwritable'));
    expect(await session.queue(a).idle()).toBe('failed');
    expect(session.chain(a).steps).toEqual([BW, SEPIA]);

    session.discard(a);
    expect(session.chain(a).steps).toEqual([BW]);
    expect(session.queue(a).status).toBe('saved');
  });
});
