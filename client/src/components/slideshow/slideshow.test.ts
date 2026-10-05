import { describe, it, expect, beforeEach } from 'vitest';
import type { Photo } from '../../../../shared/types.js';
import { usePalomaStore } from '../../store/usePalomaStore.js';
import { slideshowReducer, startPlayback } from './slideshowReducer.js';
import { slideshowStart } from './slideshowStart.js';

const photo = (id: number) => ({ id }) as Photo;

describe('slideshow playback', () => {
  it('starts playing at the given photo', () => {
    expect(startPlayback(1, 3)).toEqual({ index: 1, count: 3, playing: true, step: 0 });
    expect(startPlayback(7, 3).index).toBe(2);
  });

  it('advances on each tick and wraps to the first photo', () => {
    let state = startPlayback(1, 3);
    state = slideshowReducer(state, { type: 'tick' });
    expect(state.index).toBe(2);
    state = slideshowReducer(state, { type: 'tick' });
    expect(state.index).toBe(0);
  });

  it('stays on the photo while paused, and moves on next or previous', () => {
    let state = slideshowReducer(startPlayback(0, 3), { type: 'toggle' });
    expect(state.playing).toBe(false);
    expect(slideshowReducer(state, { type: 'tick' }).index).toBe(0);
    state = slideshowReducer(state, { type: 'next' });
    expect(state).toMatchObject({ index: 1, playing: false });
    state = slideshowReducer(slideshowReducer(state, { type: 'toggle' }), { type: 'tick' });
    expect(state).toMatchObject({ index: 2, playing: true });
  });

  it('wraps previous from the first photo to the last', () => {
    expect(slideshowReducer(startPlayback(0, 3), { type: 'previous' }).index).toBe(2);
  });

  it('restarts the interval on every move', () => {
    const start = startPlayback(0, 3);
    const moved = slideshowReducer(start, { type: 'next' });
    expect(moved.step).not.toBe(start.step);
    expect(slideshowReducer(moved, { type: 'previous' }).step).not.toBe(moved.step);
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
