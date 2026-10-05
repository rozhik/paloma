/** A slideshow's position and whether it plays; the photos themselves are in the store. */
export interface SlideshowPlayback {
  index: number;
  count: number;
  playing: boolean;
  /** Raised on every move, so the timer restarts and a photo gets its full interval */
  step: number;
}

export type SlideshowAction =
  | { type: 'next' }
  | { type: 'previous' }
  /** The interval has passed: the next photo, when playing */
  | { type: 'tick' }
  | { type: 'toggle' }
  | { type: 'reset'; index: number; count: number };

export function startPlayback(index: number, count: number): SlideshowPlayback {
  return { index: Math.min(Math.max(index, 0), Math.max(count - 1, 0)), count, playing: true, step: 0 };
}

/** Moves wrap around in both directions; a pause keeps the photo until the user moves or plays again. */
export function slideshowReducer(state: SlideshowPlayback, action: SlideshowAction): SlideshowPlayback {
  const move = (delta: number): SlideshowPlayback => (state.count === 0 ? state : {
    ...state, index: (state.index + delta + state.count) % state.count, step: state.step + 1,
  });
  switch (action.type) {
    case 'next':
      return move(1);
    case 'previous':
      return move(-1);
    case 'tick':
      return state.playing ? move(1) : state;
    case 'toggle':
      return { ...state, playing: !state.playing, step: state.step + 1 };
    case 'reset':
      return startPlayback(action.index, action.count);
  }
}
