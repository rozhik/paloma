import { describe, it, expect } from 'vitest';
import { dragCorner, fitRatio, FULL_FRAME, moveFrame, pixelRatio, framePixelSize } from './cropFrame.js';

/** Width:height of a frame in pixels on a W×H image. */
const pixels = (rect: { left: number; top: number; right: number; bottom: number }, w: number, h: number) =>
  ((rect.right - rect.left) * w) / ((rect.bottom - rect.top) * h);

describe('pixelRatio', () => {
  it('is null for free, the photo aspect for original, and turns upright for portrait', () => {
    expect(pixelRatio('free', 1.5, false)).toBeNull();
    expect(pixelRatio('original', 4 / 3, false)).toBeCloseTo(4 / 3);
    expect(pixelRatio('original', 3 / 4, false)).toBeCloseTo(4 / 3);
    expect(pixelRatio([16, 9], 1, true)).toBeCloseTo(9 / 16);
    expect(pixelRatio([1, 1], 1.5, true)).toBe(1);
  });
});

describe('fitRatio', () => {
  it('fits a square in a 4000×3000 photo, centred', () => {
    const square = fitRatio(FULL_FRAME, 1, 4 / 3);
    expect(pixels(square, 4000, 3000)).toBeCloseTo(1, 4);
    expect(square.top).toBe(0);
    expect(square.bottom).toBe(1);
    expect(square.left).toBeCloseTo(0.125);
  });

  it('keeps the rectangle for a free ratio', () => {
    const rect = { left: 0.1, top: 0.2, right: 0.5, bottom: 0.9 };
    expect(fitRatio(rect, null, 1.5)).toBe(rect);
  });
});

describe('dragCorner', () => {
  it('moves the dragged corner and keeps the opposite one', () => {
    expect(dragCorner(FULL_FRAME, 'se', { x: 0.6, y: 0.7 }, null, 1)).toEqual({ left: 0, top: 0, right: 0.6, bottom: 0.7 });
    expect(dragCorner(FULL_FRAME, 'nw', { x: 0.25, y: 0.5 }, null, 1)).toEqual({ left: 0.25, top: 0.5, right: 1, bottom: 1 });
  });

  it('keeps the frame inside the image and not smaller than the minimum', () => {
    const rect = { left: 0.2, top: 0.2, right: 0.6, bottom: 0.6 };
    expect(dragCorner(rect, 'se', { x: 1.4, y: -3 }, null, 1)).toEqual({ left: 0.2, top: 0.2, right: 1, bottom: 0.22 });
  });

  it('keeps a fixed ratio, so a 1:1 frame on a 4000×3000 photo stays square', () => {
    for (const point of [{ x: 0.9, y: 0.3 }, { x: 0.3, y: 0.95 }, { x: 2, y: 2 }]) {
      const rect = dragCorner(FULL_FRAME, 'se', point, 1, 4 / 3);
      expect(pixels(rect, 4000, 3000)).toBeCloseTo(1, 3);
      expect(rect.right).toBeLessThanOrEqual(1);
      expect(rect.bottom).toBeLessThanOrEqual(1);
    }
  });
});

describe('moveFrame', () => {
  it('moves the frame and stops at the image edges', () => {
    const rect = { left: 0.2, top: 0.2, right: 0.6, bottom: 0.5 };
    expect(moveFrame(rect, 0.1, 0.1)).toEqual({ left: 0.3, top: 0.3, right: 0.7, bottom: 0.6 });
    expect(moveFrame(rect, 1, -1)).toEqual({ left: 0.6, top: 0, right: 1, bottom: 0.3 });
  });
});

describe('framePixelSize', () => {
  it('measures the frame on the full-size image', () => {
    expect(framePixelSize({ left: 0, top: 0, right: 0.5, bottom: 1 }, { width: 4000, height: 3000 })).toEqual({ width: 2000, height: 3000 });
    expect(framePixelSize({ left: 0.1, top: 0.25, right: 0.9, bottom: 0.75 }, { width: 1000, height: 800 })).toEqual({ width: 800, height: 400 });
  });

  it('rounds to whole pixels and never goes below 1', () => {
    expect(framePixelSize({ left: 0.333333, top: 0, right: 0.666667, bottom: 0.5 }, { width: 1001, height: 3 })).toEqual({ width: 334, height: 2 });
    expect(framePixelSize({ left: 0.5, top: 0.5, right: 0.5001, bottom: 0.5001 }, { width: 100, height: 100 })).toEqual({ width: 1, height: 1 });
  });
});

