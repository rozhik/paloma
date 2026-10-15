import type { RandomSource } from './effects.js';

/**
 * A slideshow's play order, position and whether it plays; the photos themselves are in the store.
 * The order is kept in rounds of grid indexes, so Previous can walk back through what was shown, also when
 * shuffled. Without shuffle each round is the grid order; with shuffle each round shows every photo once.
 */
export interface SlideshowPlayback {
  count: number;
  rounds: number[][];
  round: number;
  /** Place in the current round */
  pos: number;
  /** The first place of the first round that was shown; in grid order the photos before the start are not */
  from: number;
  shuffle: boolean;
  playing: boolean;
  /** Whether the last move went back, so a directional effect plays the other way */
  back: boolean;
  /** Raised on every move, so the timer restarts and a photo gets its full interval */
  step: number;
  /** Raised on every move only, so the screen knows which move a finished transition belongs to */
  move: number;
}

export type SlideshowAction =
  | { type: 'next' }
  | { type: 'previous' }
  /** The interval has passed: the next photo, when playing */
  | { type: 'tick' }
  | { type: 'toggle' }
  | { type: 'shuffle'; on: boolean };

const gridOrder = (count: number) => Array.from({ length: count }, (_, index) => index);

/** Fisher–Yates on a copy. */
export function shuffled(items: readonly number[], random: RandomSource = Math.random): number[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A new shuffled round that does not start with the photo just shown, when there is a choice. */
function nextShuffledRound(count: number, last: number, random: RandomSource): number[] {
  const round = shuffled(gridOrder(count), random);
  if (count > 1 && round[0] === last) {
    const other = 1 + Math.floor(random() * (count - 1));
    [round[0], round[other]] = [round[other], round[0]];
  }
  return round;
}

/** The grid index of the photo shown. */
export const currentIndex = (state: SlideshowPlayback): number => state.rounds[state.round]?.[state.pos] ?? 0;

/** The photo's place in the current round, from 1, and the round's length; in grid order this is its grid place. */
export const positionOf = (state: SlideshowPlayback): { index: number; total: number } =>
  ({ index: state.pos + 1, total: state.rounds[state.round]?.length ?? 0 });

/** The grid index the next forward move will show, when it is already known (not at the end of a shuffled round). */
export function peekNext(state: SlideshowPlayback): number | null {
  const next = state.rounds[state.round]?.[state.pos + 1] ?? state.rounds[state.round + 1]?.[0];
  if (next !== undefined) return next;
  return state.shuffle || state.count === 0 ? null : 0;
}

/** Playback from the photo at grid `index`: in grid order, or a shuffled round that starts with it. */
export function startPlayback(index: number, count: number, shuffle = false, random: RandomSource = Math.random): SlideshowPlayback {
  const start = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
  const rest = gridOrder(count).filter((other) => other !== start);
  const rounds = count === 0 ? [[]] : shuffle ? [[start, ...shuffled(rest, random)]] : [gridOrder(count)];
  return { count, rounds, round: 0, pos: shuffle ? 0 : start, from: shuffle ? 0 : start, shuffle, playing: true, back: false, step: 0, move: 0 };
}

function forward(state: SlideshowPlayback, random: RandomSource): SlideshowPlayback {
  const moved = { ...state, back: false, step: state.step + 1, move: state.move + 1 };
  if (state.pos + 1 < state.rounds[state.round].length) return { ...moved, pos: state.pos + 1 };
  if (state.round + 1 < state.rounds.length) return { ...moved, round: state.round + 1, pos: 0 };
  const round = state.shuffle ? nextShuffledRound(state.count, currentIndex(state), random) : gridOrder(state.count);
  return { ...moved, rounds: [...state.rounds, round], round: state.rounds.length, pos: 0 };
}

function backward(state: SlideshowPlayback): SlideshowPlayback {
  const moved = { ...state, back: true, step: state.step + 1, move: state.move + 1 };
  if (state.pos > 0) {
    const pos = state.pos - 1;
    return { ...moved, pos, from: state.round === 0 ? Math.min(state.from, pos) : state.from };
  }
  if (state.round > 0) return { ...moved, round: state.round - 1, pos: state.rounds[state.round - 1].length - 1 };
  // The first photo of the slideshow: wrap to the end of the current order
  return { ...moved, pos: state.rounds[0].length - 1, from: 0 };
}

/**
 * Turning shuffle on keeps the photos shown so far in this round and shuffles the rest; turning it off
 * continues in grid order from the current photo.
 */
function setShuffle(state: SlideshowPlayback, on: boolean, random: RandomSource): SlideshowPlayback {
  if (on === state.shuffle) return state;
  const current = currentIndex(state);
  if (!on) return { ...state, shuffle: false, rounds: [gridOrder(state.count)], round: 0, pos: current, from: current };
  const from = state.round === 0 ? Math.min(state.from, state.pos) : 0;
  const shown = state.rounds[state.round].slice(from, state.pos + 1);
  const seen = new Set(shown);
  const rest = gridOrder(state.count).filter((index) => !seen.has(index));
  const rounds = [...state.rounds.slice(0, state.round), [...shown, ...shuffled(rest, random)]];
  return { ...state, shuffle: true, rounds, pos: state.pos - from, from: state.round === 0 ? 0 : state.from };
}

/** Moves wrap around in both directions; a pause keeps the photo until the user moves or plays again. */
export function slideshowReducer(state: SlideshowPlayback, action: SlideshowAction, random: RandomSource = Math.random): SlideshowPlayback {
  if (state.count === 0) return action.type === 'toggle' ? { ...state, playing: !state.playing } : state;
  switch (action.type) {
    case 'next':
      return forward(state, random);
    case 'previous':
      return backward(state);
    case 'tick':
      return state.playing ? forward(state, random) : state;
    case 'toggle':
      return { ...state, playing: !state.playing, step: state.step + 1 };
    case 'shuffle':
      return setShuffle(state, action.on, random);
  }
}
