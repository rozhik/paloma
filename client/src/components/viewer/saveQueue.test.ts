import { describe, it, expect, vi } from 'vitest';
import type { EditStep, Photo, PhotoEdits } from '../../../../shared/types.js';
import { PhotoSaveQueue, ViewerEditSession, type EditsPayload } from './saveQueue.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const photo = (id: number, edits: EditStep[] | null = null) => ({ id, edits }) as Photo;
const SEPIA: EditStep = { filter: 'sepia' };
const BW: EditStep = { filter: 'bw' };
const payload = (edits: EditStep[], undo: EditStep[][] = [], redo: EditStep[][] = []): EditsPayload => ({ edits, history: { undo, redo } });

/**
 * A fake server: sidecar contents by photo id. Saves wait until the test resolves or rejects them; loads
 * answer at once from what was saved.
 */
function fakeServer(stored: Record<number, PhotoEdits> = {}) {
  const calls: { photoId: number; payload: EditsPayload; resolve: () => void; reject: (err: unknown) => void }[] = [];
  const save = vi.fn((photoId: number, sent: EditsPayload) => new Promise<Photo>((resolve, reject) => {
    calls.push({
      photoId,
      payload: sent,
      resolve: () => {
        stored[photoId] = structuredClone(sent);
        resolve({ id: photoId, edits: sent.edits.length ? sent.edits : null } as Photo);
      },
      reject,
    });
  }));
  const load = vi.fn(async (photoId: number) => structuredClone(stored[photoId] ?? payload([])));
  return { calls, save, load, stored };
}

/** A session on the fake server, as the viewer creates one each time it opens. */
const newSession = (server: ReturnType<typeof fakeServer>) =>
  new ViewerEditSession({ load: server.load, save: server.save }, () => {}, () => {});

/** Opens a photo in the session and waits for its history to load. */
async function open(session: ViewerEditSession, p: Photo) {
  session.chain(p);
  await flush();
  return p;
}

describe('PhotoSaveQueue', () => {
  it('sends nothing when the payload is what is saved', () => {
    const server = fakeServer();
    const queue = new PhotoSaveQueue(payload([SEPIA]), (p) => server.save(1, p), () => {}, () => {});
    queue.request(payload([SEPIA]));
    expect(server.save).not.toHaveBeenCalled();
    expect(queue.status).toBe('saved');
  });

  it('saves a change of the history alone', () => {
    const server = fakeServer();
    const queue = new PhotoSaveQueue(payload([SEPIA], [[]]), (p) => server.save(1, p), () => {}, () => {});
    queue.request(payload([SEPIA], [[]], [[SEPIA, BW]]));
    expect(server.calls).toHaveLength(1);
  });

  it('keeps one request in flight and sends the latest payload last', async () => {
    const server = fakeServer();
    const saved = vi.fn();
    const queue = new PhotoSaveQueue(payload([]), (p) => server.save(1, p), () => {}, saved);
    queue.request(payload([SEPIA], [[]]));
    queue.request(payload([SEPIA, BW], [[], [SEPIA]]));
    queue.request(payload([BW], [[]]));
    expect(server.calls.map((c) => c.payload.edits)).toEqual([[SEPIA]]);

    server.calls[0].resolve();
    await flush();
    expect(server.calls.map((c) => c.payload.edits)).toEqual([[SEPIA], [BW]]);

    server.calls[1].resolve();
    await flush();
    expect(queue.status).toBe('saved');
    expect(queue.saved).toEqual(payload([BW], [[]]));
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it('keeps the wanted payload after a failure and saves it on retry', async () => {
    const server = fakeServer();
    const queue = new PhotoSaveQueue(payload([]), (p) => server.save(1, p), () => {}, () => {});
    queue.request(payload([SEPIA], [[]]));
    server.calls[0].reject(new Error('disk full'));
    expect(await queue.idle()).toBe('failed');
    expect(queue.error).toEqual(new Error('disk full'));
    expect(queue.saved).toEqual(payload([]));

    queue.retry();
    expect(server.calls[1].payload).toEqual(payload([SEPIA], [[]]));
    server.calls[1].resolve();
    expect(await queue.idle()).toBe('saved');
  });

  it('waits for the save in flight before reporting idle', async () => {
    const server = fakeServer();
    const queue = new PhotoSaveQueue(payload([]), (p) => server.save(1, p), () => {}, () => {});
    queue.request(payload([SEPIA], [[]]));
    let done = false;
    const idle = queue.idle().then((status) => { done = true; return status; });
    await flush();
    expect(done).toBe(false);
    server.calls[0].resolve();
    expect(await idle).toBe('saved');
  });
});

describe('ViewerEditSession', () => {
  it('ignores changes until the photo’s stored history has loaded', async () => {
    const server = fakeServer({ 1: payload([SEPIA], [[]]) });
    const session = newSession(server);
    const a = photo(1, [SEPIA]);
    expect(session.load(a)).toEqual({ state: 'loading' });
    session.dispatch(a, { type: 'rotate', delta: 90 });
    expect(server.save).not.toHaveBeenCalled();

    await flush();
    expect(session.load(a)).toEqual({ state: 'ready' });
    expect(session.chain(a).past).toEqual([[]]);
  });

  it('reports a history that cannot be loaded and keeps editing off', async () => {
    const server = fakeServer();
    server.load.mockRejectedValueOnce(new Error('offline'));
    const session = newSession(server);
    const a = await open(session, photo(1));
    expect(session.load(a)).toEqual({ state: 'failed', error: new Error('offline') });
    session.dispatch(a, { type: 'rotate', delta: 90 });
    expect(server.save).not.toHaveBeenCalled();
  });

  it('saves the history with every finished change, but not a slider that is still moving', async () => {
    const server = fakeServer();
    const session = newSession(server);
    const a = await open(session, photo(1));
    session.dispatch(a, { type: 'apply', filter: 'brightness', params: { amount: 10 } });
    session.dispatch(a, { type: 'apply', filter: 'brightness', params: { amount: 30 } });
    expect(server.save).not.toHaveBeenCalled();

    session.dispatch(a, { type: 'commit' });
    expect(server.calls[0].payload).toEqual(payload([{ filter: 'brightness', amount: 30 }], [[]]));
    server.calls[0].resolve();
    await flush();

    session.dispatch(a, { type: 'commit' });
    expect(server.save).toHaveBeenCalledTimes(1);
  });

  it('undoes changes made before the viewer was closed', async () => {
    const server = fakeServer();
    const first = newSession(server);
    const a = await open(first, photo(1));
    const step = async (session: ViewerEditSession, action: Parameters<ViewerEditSession['dispatch']>[1]) => {
      session.dispatch(a, action);
      server.calls[server.calls.length - 1].resolve();
      await flush();
    };
    await step(first, { type: 'rotate', delta: 90 });
    await step(first, { type: 'apply', filter: 'sepia', params: {} });
    await step(first, { type: 'commit' });

    // The viewer closes; a new one opens the photo with what was saved
    const second = newSession(server);
    await open(second, photo(1, [{ filter: 'rotate', angle: 90 }, SEPIA]));
    expect(second.chain(a).past).toHaveLength(2);
    await step(second, { type: 'undo' });
    await step(second, { type: 'undo' });
    expect(second.chain(a).steps).toEqual([]);
    expect(server.stored[1]).toEqual(payload([], [], [[{ filter: 'rotate', angle: 90 }], [{ filter: 'rotate', angle: 90 }, SEPIA]]));

    await step(second, { type: 'redo' });
    expect(server.stored[1].edits).toEqual([{ filter: 'rotate', angle: 90 }]);
  });

  it('keeps each photo’s history apart', async () => {
    const server = fakeServer();
    const session = newSession(server);
    const a = await open(session, photo(1));
    const b = await open(session, photo(2));
    session.dispatch(a, { type: 'apply', filter: 'sepia', params: {} });
    session.dispatch(a, { type: 'commit' });
    server.calls[0].resolve();
    await flush();
    session.dispatch(b, { type: 'rotate', delta: -90 });
    server.calls[1].resolve();
    await flush();

    session.dispatch(a, { type: 'undo' });
    expect(session.chain(a).steps).toEqual([]);
    expect(server.calls[2]).toMatchObject({ photoId: 1, payload: payload([], [], [[SEPIA]]) });
    expect(session.chain(b).steps).toEqual([{ filter: 'rotate', angle: 270 }]);
  });

  it('discards an unsaved change after a failure, back to the saved chain and history', async () => {
    const server = fakeServer({ 1: payload([BW], [[]]) });
    const session = newSession(server);
    const a = await open(session, photo(1, [BW]));
    session.dispatch(a, { type: 'apply', filter: 'sepia', params: {} });
    session.dispatch(a, { type: 'commit' });
    server.calls[0].reject(new Error('unwritable'));
    expect(await session.queue(a).idle()).toBe('failed');
    expect(session.chain(a).steps).toEqual([BW, SEPIA]);

    session.discard(a);
    expect(session.chain(a).steps).toEqual([BW]);
    expect(session.chain(a).past).toEqual([[]]);
    expect(session.queue(a).status).toBe('saved');
  });
});
