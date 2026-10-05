import type { EditHistory, Photo, PhotoEdits } from '../../../../shared/types.js';
import { chainReducer, initialChain, type ChainAction, type ChainState } from '../editChain.js';

export type SaveStatus = 'saved' | 'saving' | 'failed';

/** What is saved for a photo: its chain and its undo history. */
export type EditsPayload = PhotoEdits;

const same = (a: EditsPayload, b: EditsPayload) => JSON.stringify(a) === JSON.stringify(b);
const EMPTY_HISTORY: EditHistory = { undo: [], redo: [] };

/** The payload that saves a chain state: its steps and its undo and redo stacks. */
export const payloadOf = (chain: ChainState): EditsPayload => ({ edits: chain.steps, history: { undo: chain.past, redo: chain.future } });

/** A chain state rebuilt from a saved payload, with its history. */
export const chainOf = ({ edits, history }: EditsPayload): ChainState => ({ steps: edits, past: history.undo, future: history.redo, merging: null });

/**
 * Saves one photo's chain and history in the background. At most one request is in flight; a change made
 * meanwhile waits and only the latest payload is sent next, so writes to `.paloma.json` never arrive out of order.
 */
export class PhotoSaveQueue {
  /** What the server has, as far as we know */
  saved: EditsPayload;
  status: SaveStatus = 'saved';
  error: unknown = null;
  /** What the user wants saved; differs from `saved` while saving or after a failure */
  private wanted: EditsPayload;
  private inFlight: Promise<void> | null = null;
  private waiters: (() => void)[] = [];

  constructor(
    saved: EditsPayload,
    private readonly save: (payload: EditsPayload) => Promise<Photo>,
    private readonly onChange: () => void,
    private readonly onSaved: (photo: Photo) => void,
  ) {
    this.saved = saved;
    this.wanted = saved;
  }

  /** Asks for `payload` to be saved; does nothing when it is what is saved or about to be. */
  request(payload: EditsPayload): void {
    this.wanted = payload;
    if (this.inFlight) return;
    if (same(payload, this.saved)) {
      if (this.status === 'failed') this.settle('saved', null);
      return;
    }
    this.send();
  }

  /** Sends the wanted payload again after a failure. */
  retry(): void {
    if (!this.inFlight && this.status === 'failed') this.send();
  }

  /** Gives up on the unsaved payload; the caller shows `saved` again. */
  discard(): void {
    this.wanted = this.saved;
    if (!this.inFlight) this.settle('saved', null);
  }

  /** Waits until nothing is being saved; resolves with the final status. */
  idle(): Promise<SaveStatus> {
    if (!this.inFlight) return Promise.resolve(this.status);
    return new Promise((resolve) => this.waiters.push(() => resolve(this.status)));
  }

  private send(): void {
    const payload = this.wanted;
    this.status = 'saving';
    this.error = null;
    this.onChange();
    this.inFlight = this.save(payload).then(
      (photo) => {
        // What we sent, not the server's copy with defaults filled in, so an unchanged chain is not resent
        this.saved = payload;
        this.inFlight = null;
        this.onSaved(photo);
        if (!same(this.wanted, payload) && !same(this.wanted, this.saved)) {
          this.send();
        } else {
          this.settle('saved', null);
        }
      },
      (err: unknown) => {
        this.inFlight = null;
        this.settle('failed', err);
      },
    );
  }

  private settle(status: SaveStatus, error: unknown): void {
    this.status = status;
    this.error = error;
    this.onChange();
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }
}

/** Whether a photo's stored history has arrived; editing waits for it, so a save never drops it. */
export type HistoryLoad = { state: 'loading' } | { state: 'ready' } | { state: 'failed'; error: unknown };

interface PhotoSession {
  chain: ChainState;
  queue: PhotoSaveQueue;
  load: HistoryLoad;
}

/**
 * The viewer's edits. Each photo's chain and its undo history come from its sidecar, so changes made before
 * the viewer was closed, the page reloaded or Paloma restarted can be undone. Every finished change is saved
 * with the history; a slider that is still moving (an `apply` or `update` that starts a merge) is saved when
 * it is committed.
 */
export class ViewerEditSession {
  private photos = new Map<number, PhotoSession>();

  constructor(
    private readonly api: {
      load: (photoId: number) => Promise<PhotoEdits>;
      save: (photoId: number, payload: EditsPayload) => Promise<Photo>;
    },
    private readonly onChange: () => void,
    private readonly onSaved: (photo: Photo) => void,
  ) {}

  private session(photo: Photo): PhotoSession {
    let session = this.photos.get(photo.id);
    if (!session) {
      // The photo's own chain shows at once; its history follows
      const saved: EditsPayload = { edits: photo.edits ?? [], history: EMPTY_HISTORY };
      const created: PhotoSession = {
        chain: initialChain(saved.edits),
        queue: new PhotoSaveQueue(saved, (payload) => this.api.save(photo.id, payload), this.onChange, this.onSaved),
        load: { state: 'loading' },
      };
      session = created;
      this.photos.set(photo.id, created);
      this.api.load(photo.id).then(
        (stored) => {
          created.chain = chainOf(stored);
          created.queue.saved = stored;
          created.queue.discard();
          created.load = { state: 'ready' };
          this.onChange();
        },
        (error: unknown) => {
          created.load = { state: 'failed', error };
          this.onChange();
        },
      );
    }
    return session;
  }

  chain(photo: Photo): ChainState {
    return this.session(photo).chain;
  }

  queue(photo: Photo): PhotoSaveQueue {
    return this.session(photo).queue;
  }

  load(photo: Photo): HistoryLoad {
    return this.session(photo).load;
  }

  /** Applies a change; ignored until the photo's history has loaded. */
  dispatch(photo: Photo, action: ChainAction): void {
    const session = this.session(photo);
    if (session.load.state !== 'ready') return;
    const next = chainReducer(session.chain, action);
    if (next === session.chain) return;
    session.chain = next;
    this.onChange();
    if (next.merging === null) session.queue.request(payloadOf(next));
  }

  /** After a failed save: back to the saved chain and history. */
  discard(photo: Photo): void {
    const session = this.session(photo);
    session.queue.discard();
    session.chain = chainOf(session.queue.saved);
    this.onChange();
  }
}
