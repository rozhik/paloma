import { describe, it, expect, beforeEach } from 'vitest';
import type { Photo } from '../../../../shared/types.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import {
  type SlideshowAction, type SlideshowPlayback, currentIndex, positionOf, slideshowReducer, startPlayback,
} from './slideshowReducer.js';
import { slideshowStart } from './slideshowStart.js';

const photo = (id: number) => ({ id }) as Photo;

describe('slideshow playback', () => {
  /** A seeded random source (mulberry32), so shuffled orders are repeatable */
  const seeded = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const run = (state: SlideshowPlayback, actions: SlideshowAction['type'][], random = seeded(1)) => {
    const shown = [currentIndex(state)];
    for (const type of actions) {
      state = slideshowReducer(state, { type } as SlideshowAction, random);
      shown.push(currentIndex(state));
    }
    return { state, shown };
  };

  it('starts playing at the given photo', () => {
    expect(startPlayback(1, 3)).toMatchObject({ playing: true, shuffle: false, step: 0 });
    expect(currentIndex(startPlayback(1, 3))).toBe(1);
    expect(currentIndex(startPlayback(7, 3))).toBe(2);
    expect(positionOf(startPlayback(1, 3))).toEqual({ index: 2, total: 3 });
  });

  it('advances on each tick and wraps to the first photo', () => {
    expect(run(startPlayback(1, 3), ['tick', 'tick', 'tick']).shown).toEqual([1, 2, 0, 1]);
  });

  it('stays on the photo while paused, and moves on next or previous', () => {
    let state = slideshowReducer(startPlayback(0, 3), { type: 'toggle' });
    expect(state.playing).toBe(false);
    expect(currentIndex(slideshowReducer(state, { type: 'tick' }))).toBe(0);
    state = slideshowReducer(state, { type: 'next' });
    expect(currentIndex(state)).toBe(1);
    expect(state.playing).toBe(false);
    state = slideshowReducer(slideshowReducer(state, { type: 'toggle' }), { type: 'tick' });
    expect(currentIndex(state)).toBe(2);
    expect(state.playing).toBe(true);
  });

  it('wraps previous from the first photo to the last', () => {
    expect(currentIndex(slideshowReducer(startPlayback(0, 3), { type: 'previous' }))).toBe(2);
    expect(currentIndex(slideshowReducer(startPlayback(1, 3), { type: 'previous' }))).toBe(0);
  });

  it('restarts the interval on every move and remembers going back', () => {
    const start = startPlayback(0, 3);
    const moved = slideshowReducer(start, { type: 'next' });
    expect(moved.step).not.toBe(start.step);
    expect(moved.back).toBe(false);
    const back = slideshowReducer(moved, { type: 'previous' });
    expect(back.step).not.toBe(moved.step);
    expect(back.back).toBe(true);
  });

  describe('shuffled', () => {
    it('starts with the given photo and shows every photo once per round', () => {
      const { shown } = run(startPlayback(4, 12, true, seeded(7)), Array(11).fill('tick'));
      expect(shown[0]).toBe(4);
      expect([...shown].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
      expect(shown).not.toEqual(Array.from({ length: 12 }, (_, i) => (i + 4) % 12));
    });

    it('starts each new round with a photo other than the one just shown', () => {
      for (let seed = 1; seed <= 50; seed++) {
        const random = seeded(seed);
        const { shown } = run(startPlayback(0, 3, true, random), Array(12).fill('tick'), random);
        for (const end of [2, 5, 8, 11]) expect(shown[end + 1]).not.toBe(shown[end]);
        for (const round of [0, 3, 6, 9]) expect(new Set(shown.slice(round, round + 3)).size).toBe(3);
      }
    });

    it('keeps showing a single photo', () => {
      expect(run(startPlayback(0, 1, true), ['tick', 'tick']).shown).toEqual([0, 0, 0]);
    });

    it('shows the place in the round', () => {
      const { state } = run(startPlayback(5, 6, true), ['tick', 'tick']);
      expect(positionOf(state)).toEqual({ index: 3, total: 6 });
    });

    it('goes back through the photos as they were shown, also into the previous round', () => {
      const { state, shown } = run(startPlayback(0, 5, true, seeded(3)), Array(6).fill('next'), seeded(3));
      const back = run(state, Array(6).fill('previous')).shown;
      expect(back).toEqual([...shown].reverse());
    });

    it('wraps previous from the first photo to the end of the current order', () => {
      const state = startPlayback(2, 4, true, seeded(5));
      const last = state.rounds[0][3];
      expect(currentIndex(slideshowReducer(state, { type: 'previous' }))).toBe(last);
    });
  });

  describe('turning shuffle on and off', () => {
    it('keeps the current photo and continues in grid order when turned off', () => {
      let state = run(startPlayback(0, 5, true, seeded(9)), ['tick', 'tick']).state;
      const current = currentIndex(state);
      state = slideshowReducer(state, { type: 'shuffle', on: false });
      expect(state.shuffle).toBe(false);
      expect(currentIndex(state)).toBe(current);
      expect(currentIndex(slideshowReducer(state, { type: 'tick' }))).toBe((current + 1) % 5);
    });

    it('keeps the current photo and shuffles only the photos not shown yet when turned on', () => {
      let state = run(startPlayback(2, 8), ['tick', 'tick']).state;
      expect(currentIndex(state)).toBe(4);
      state = slideshowReducer(state, { type: 'shuffle', on: true }, seeded(4));
      expect(state.shuffle).toBe(true);
      expect(currentIndex(state)).toBe(4);
      const rest = run(state, Array(5).fill('tick'), seeded(4)).shown.slice(1);
      expect([...rest].sort((a, b) => a - b)).toEqual([0, 1, 5, 6, 7]);
    });

    it('does nothing when shuffle is already as asked', () => {
      const state = startPlayback(0, 3);
      expect(slideshowReducer(state, { type: 'shuffle', on: false })).toBe(state);
    });
  });
});

describe('starting a slideshow', () => {
  beforeEach(() => usePalomaStore.setState({ slideshow: null, selectedPhotos: [] }));

  it('starts at the first selected photo in grid order', () => {
    const photos = [photo(1), photo(2), photo(3)];
    expect(slideshowStart(photos, [photo(3), photo(2)])).toBe(1);
    expect(slideshowStart(photos, [])).toBe(0);
    expect(slideshowStart(photos, [photo(9)])).toBe(0);
  });

  it('is kept in the store until it is stopped', () => {
    const photos = [photo(1), photo(2)];
    usePalomaStore.getState().startSlideshow(photos, 1);
    expect(usePalomaStore.getState().slideshow).toEqual({ photos, index: 1 });
    usePalomaStore.getState().stopSlideshow();
    expect(usePalomaStore.getState().slideshow).toBeNull();
  });

  it('does not start without photos', () => {
    usePalomaStore.getState().startSlideshow([], 0);
    expect(usePalomaStore.getState().slideshow).toBeNull();
  });
});

describe('slideshow keys', () => {
  const press = async (chord: string, basedOn: 'windows' | 'tvBox' = 'windows', rtl = false) => {
    const { pickAction, LAYER } = await import('../../keys/dispatcher.js');
    const { resolveKeymap } = await import('../../../../shared/keymaps.js');
    const handlers = {
      'slideshow.playPause': () => {}, 'slideshow.previous': () => {}, 'slideshow.next': () => {}, 'slideshow.shuffle': () => {},
      'slideshow.exit': () => {},
    };
    return pickAction({
      chord, typing: false, activates: false, dialog: false, handled: false, rtl, allows: () => true,
      registrations: [{ section: 'slideshow', layer: LAYER.slideshow, handlers }], keymap: resolveKeymap({ basedOn, bindings: {} }),
    })?.id;
  };

  it('plays and pauses with Space, moves with the arrows and exits with Esc', async () => {
    expect(await press('Space')).toBe('slideshow.playPause');
    expect(await press('ArrowRight')).toBe('slideshow.next');
    expect(await press('ArrowLeft')).toBe('slideshow.previous');
    expect(await press('Escape')).toBe('slideshow.exit');
  });

  it('turns shuffle on or off with S, and with the blue key of a remote', async () => {
    expect(await press('S')).toBe('slideshow.shuffle');
    expect(await press('ColorF3Blue', 'tvBox')).toBe('slideshow.shuffle');
  });

  it('swaps the arrows in a right-to-left language', async () => {
    expect(await press('ArrowLeft', 'windows', true)).toBe('slideshow.next');
  });

  it('plays and pauses with the remote\'s play/pause button', async () => {
    expect(await press('MediaPlayPause', 'tvBox')).toBe('slideshow.playPause');
    expect(await press('GoBack', 'tvBox')).toBe('slideshow.exit');
  });
});
