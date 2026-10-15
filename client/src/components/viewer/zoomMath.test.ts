import { describe, it, expect } from 'vitest';
import {
  MAX_SCALE, atLevel, canZoomTo, clampPan, fillScale, filled, fitScale, fitted, isFilled, isFitted, panBy, resized, toggleZoom,
  wheelFactor, zoomAt, type Point, type ZoomState,
} from './zoomMath.js';

const stage = { width: 1600, height: 900 };
const photo = { width: 4000, height: 3000 };

/** Where a photo pixel is shown, relative to the stage centre. */
const screenOf = (state: ZoomState, p: Point) => ({
  x: state.x + (p.x - photo.width / 2) * state.scale,
  y: state.y + (p.y - photo.height / 2) * state.scale,
});

describe('zoomMath', () => {
  it('fits a large photo into the stage and keeps a small one at 100%', () => {
    expect(fitScale(photo, stage)).toBe(0.3);
    expect(fitScale({ width: 640, height: 480 }, stage)).toBe(1);
    expect(fitted(photo, stage)).toEqual({ scale: 0.3, x: 0, y: 0 });
  });

  it('keeps the photo point under the anchor in place while zooming', () => {
    const start = fitted(photo, stage);
    const anchor = { x: -300, y: 120 };
    const pixel = { x: photo.width / 2 + anchor.x / start.scale, y: photo.height / 2 + anchor.y / start.scale };
    const zoomed = zoomAt(start, 0.9, photo, stage, anchor);
    expect(zoomed.scale).toBe(0.9);
    const shown = screenOf(zoomed, pixel);
    expect(shown.x).toBeCloseTo(anchor.x);
    expect(shown.y).toBeCloseTo(anchor.y);
  });

  it('limits zoom between fitted and 400%', () => {
    const start = fitted(photo, stage);
    expect(zoomAt(start, 10, photo, stage).scale).toBe(MAX_SCALE);
    expect(zoomAt(start, 0.01, photo, stage).scale).toBe(0.3);
    expect(zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, MAX_SCALE * 1.25, photo, stage).scale).toBe(MAX_SCALE);
  });

  it('stops panning at the edges and centres an axis that fits', () => {
    const zoomed: ZoomState = { scale: 0.5, x: 0, y: 0 };
    // 2000×1500 shown in 1600×900: 200 px of slack sideways, 300 px up and down
    expect(panBy(zoomed, -1000, 0, photo, stage)).toEqual({ scale: 0.5, x: -200, y: 0 });
    expect(panBy(zoomed, 0, 1000, photo, stage)).toEqual({ scale: 0.5, x: 0, y: 300 });
    const wide = { width: 4000, height: 1000 };
    // 2000×500 at 0.5: taller stage than photo, so it stays centred vertically
    expect(clampPan({ scale: 0.5, x: 50, y: 80 }, wide, stage)).toEqual({ scale: 0.5, x: 50, y: 0 });
  });

  it('refits a fitted photo after a resize and keeps another zoom', () => {
    const bigger = { width: 2000, height: 1500 };
    expect(resized(fitted(photo, stage), photo, stage, bigger)).toEqual({ scale: 0.5, x: 0, y: 0 });
    expect(resized({ scale: 1, x: -1000, y: 0 }, photo, stage, bigger)).toEqual({ scale: 1, x: -1000, y: 0 });
    expect(resized({ scale: 1, x: -1500, y: 0 }, photo, stage, bigger).x).toBe(-1000);
  });

  it('toggles between fitted and 100% at the clicked point', () => {
    const start = fitted(photo, stage);
    const at100 = toggleZoom(start, photo, stage, { x: 0, y: 0 });
    expect(at100.scale).toBe(1);
    expect(isFitted(at100, photo, stage)).toBe(false);
    expect(toggleZoom(at100, photo, stage, { x: 10, y: 10 })).toEqual(start);
  });

  it('zooms in for wheel up and out for wheel down', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });

  describe('zoom levels', () => {
    it('fills the stage with a large photo, cropping top and bottom', () => {
      expect(fillScale(photo, stage)).toBe(0.4);
      expect(filled(photo, stage)).toEqual({ scale: 0.4, x: 0, y: 0 });
      expect(clampPan({ scale: 0.4, x: 0, y: 500 }, photo, stage).y).toBe(150);
    });

    it('fills a tiny photo at most at 400%', () => {
      expect(fillScale({ width: 100, height: 100 }, stage)).toBe(MAX_SCALE);
    });

    it('opens at each named level, centred', () => {
      expect(atLevel('fit', photo, stage)).toEqual({ scale: 0.3, x: 0, y: 0 });
      expect(atLevel('fill', photo, stage)).toEqual({ scale: 0.4, x: 0, y: 0 });
      expect(atLevel('actual', photo, stage)).toEqual({ scale: 1, x: 0, y: 0 });
      expect(atLevel('fit', { width: 640, height: 480 }, stage).scale).toBe(1);
    });

    it('offers only percentages from the fitted size up', () => {
      expect(canZoomTo(0.5, photo, stage)).toBe(true);
      expect(canZoomTo(0.5, { width: 1000, height: 750 }, stage)).toBe(false);
      expect(canZoomTo(1, { width: 1000, height: 750 }, stage)).toBe(true);
    });

    it('keeps a filled photo filled when the stage is resized', () => {
      const bigger = { width: 2000, height: 1000 };
      expect(isFilled(filled(photo, stage), photo, stage)).toBe(true);
      expect(resized(filled(photo, stage), photo, stage, bigger)).toEqual({ scale: 0.5, x: 0, y: 0 });
    });
  });
});
