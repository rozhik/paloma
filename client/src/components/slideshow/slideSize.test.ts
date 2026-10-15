import { describe, it, expect } from 'vitest';
import { renderSizeFor, slideBox } from './slideSize.js';

const screen = { width: 1600, height: 900 };
const small = { width: 640, height: 480 };
const large = { width: 4000, height: 3000 };

describe('slideshow photo size', () => {
  it('fits the whole photo, enlarging a small one', () => {
    expect(slideBox('fit', small, screen)).toEqual({ width: 1200, height: 900 });
    expect(slideBox('fit', large, screen)).toEqual({ width: 1200, height: 900 });
  });

  it('fits without enlarging a small photo', () => {
    expect(slideBox('fitNoEnlarge', small, screen)).toEqual({ width: 640, height: 480 });
    expect(slideBox('fitNoEnlarge', large, screen)).toEqual({ width: 1200, height: 900 });
  });

  it('fills the screen, cropping equally', () => {
    expect(slideBox('fill', large, screen)).toEqual({ width: 1600, height: 1200 });
  });

  it('shows the actual pixels at original size', () => {
    expect(slideBox('actual', large, screen)).toEqual(large);
  });

  it('asks for a sharper rendering only when the cached preview is too small', () => {
    expect(renderSizeFor('fit', large, screen, 1)).toBe(1280);
    expect(renderSizeFor('actual', large, screen, 2)).toBe(4096);
    expect(renderSizeFor('fit', { width: 600, height: 400 }, screen, 1)).toBeNull();
    expect(renderSizeFor('fitNoEnlarge', small, { width: 700, height: 500 }, 1)).toBeNull();
  });
});
