import type { EditStep, Photo } from '../../../../shared/types.js';
import { chainReducer, initialChain, type ChainAction, type ChainState } from '../editChain.js';

export type SaveStatus = 'saved' | 'saving' | 'failed';

const same = (a: EditStep[], b: EditStep[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Saves one photo's chain in the background. At most one request is in flight; a change made meanwhile
 * waits and only the latest steps are sent next, so writes to `.paloma.json` never arrive out of order.
 */
export class PhotoSaveQueue {
  /** The chain the server has, as far as we know */
  saved: EditStep[];
  status: SaveStatus = 'saved';
  error: unknown = null;
  /** The chain the user wants saved; differs from `saved` while saving or after a failure */
  private wanted: EditStep[];
  private inFlight: Promise<void> | null = null;
  private waiters: (() => void)[] = [];

  constructor(
    saved: EditStep[],
    private readonly save: (steps: EditStep[]) => Promise<Photo>,
    private readonly onChange: () => void,
    private readonly onSaved: (photo: Photo) => void,
  ) {
    this.saved = saved;
    this.wanted = saved;
  }

  /** Asks for `steps` to be saved; does nothing when they are what is saved or about to be. */
  request(steps: EditStep[]): void {
    this.wanted = steps;
    if (this.inFlight) return;
    if (same(steps, this.saved)) {
      if (this.status === 'failed') this.settle('saved', null);
      return;
    }
    this.send();
  }

  /** Sends the wanted chain again after a failure. */
  retry(): void {
    if (!this.inFlight && this.status === 'failed') this.send();
  }

  /** Gives up on the unsaved chain; the caller shows `saved` again. */
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
    const steps = this.wanted;
    this.status = 'saving';
    this.error = null;
    this.onChange();
    this.inFlight = this.save(steps).then(
      (photo) => {
        // What we sent, not the server's copy with defaults filled in, so an unchanged chain is not resent
        this.saved = steps;
        this.inFlight = null;
        this.onSaved(photo);
        if (!same(this.wanted, steps) && !same(this.wanted, this.saved)) {
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

interface PhotoSession {
  chain: ChainState;
  queue: PhotoSaveQueue;
}

/**
 * The viewer's edits. The saved chain is the photo's history, so every step can be undone, also steps saved
 * before the viewer was opened. Every finished change is saved; a slider that is still moving (an `apply`
 * that starts a merge) is saved when it is committed.
 */
export class ViewerEditSession {
  private photos = new Map<number, PhotoSession>();

  constructor(
    private readonly save: (photoId: number, steps: EditStep[]) => Promise<Photo>,
    private readonly onChange: () => void,
    private readonly onSaved: (photo: Photo) => void,
  ) {}

  private session(photo: Photo): PhotoSession {
    let session = this.photos.get(photo.id);
    if (!session) {
      const steps = photo.edits ?? [];
      session = {
        chain: initialChain(steps),
        queue: new PhotoSaveQueue(steps, (s) => this.save(photo.id, s), this.onChange, this.onSaved),
      };
      this.photos.set(photo.id, session);
    }
    return session;
  }

  chain(photo: Photo): ChainState {
    return this.session(photo).chain;
  }

  queue(photo: Photo): PhotoSaveQueue {
    return this.session(photo).queue;
  }

  dispatch(photo: Photo, action: ChainAction): void {
    const session = this.session(photo);
    const next = chainReducer(session.chain, action);
    if (next === session.chain) return;
    session.chain = next;
    this.onChange();
    if (next.merging === null) session.queue.request(next.steps);
  }

  /** After a failed save: back to the saved chain. */
  discard(photo: Photo): void {
    const session = this.session(photo);
    session.queue.discard();
    session.chain = chainReducer(session.chain, { type: 'load', steps: session.queue.saved });
    this.onChange();
  }
}
