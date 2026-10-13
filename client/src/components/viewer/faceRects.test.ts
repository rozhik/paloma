import { describe, it, expect } from 'vitest';
import { faceRectMapper, rectStyle } from './faceRects.js';

const FACE = { left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 };
const map = (steps: Parameters<typeof faceRectMapper>[0], rect = FACE) => faceRectMapper(steps)!(rect);
const close = (actual: object | undefined, expected: object) => {
  expect(actual).toBeDefined();
  for (const [key, value] of Object.entries(expected)) expect((actual as Record<string, number>)[key], key).toBeCloseTo(value as number);
};

describe('faceRectMapper', () => {
  it('keeps rectangles of a photo without geometric edits', () => {
    expect(map([])).toEqual(FACE);
    expect(map([{ filter: 'sepia' }, { filter: 'brightness', amount: 20 }])).toEqual(FACE);
  });

  it('follows a crop and leaves out faces outside it', () => {
    close(map([{ filter: 'crop64', rect: { left: 0, top: 0, right: 0.5, bottom: 1 } }]), { left: 0.2, top: 0.2, right: 0.6, bottom: 0.5 });
    expect(map([{ filter: 'crop64', rect: { left: 0.5, top: 0, right: 1, bottom: 1 } }])).toBeUndefined();
  });

  it('clips a face cut by the crop', () => {
    close(map([{ filter: 'crop64', rect: { left: 0.2, top: 0, right: 1, bottom: 1 } }]), { left: 0, top: 0.2, right: 0.125, bottom: 0.5 });
  });

  it('turns rectangles with quarter turns clockwise', () => {
    close(map([{ filter: 'rotate', angle: 90 }]), { left: 0.5, top: 0.1, right: 0.8, bottom: 0.3 });
    close(map([{ filter: 'rotate', angle: 180 }]), { left: 0.7, top: 0.5, right: 0.9, bottom: 0.8 });
    close(map([{ filter: 'rotate', angle: 270 }]), { left: 0.2, top: 0.7, right: 0.5, bottom: 0.9 });
    close(map([{ filter: 'rotate', angle: 90 }, { filter: 'rotate', angle: 270 }]), FACE);
  });

  it('mirrors rectangles', () => {
    close(map([{ filter: 'flip', direction: 'horizontal' }]), { left: 0.7, top: 0.2, right: 0.9, bottom: 0.5 });
    close(map([{ filter: 'flip', direction: 'vertical' }]), { left: 0.1, top: 0.5, right: 0.3, bottom: 0.8 });
  });

  it('applies steps in order', () => {
    // rotate first, then crop the left half of the turned picture
    close(map([{ filter: 'rotate', angle: 90 }, { filter: 'crop64', rect: { left: 0.5, top: 0, right: 1, bottom: 1 } }]),
      { left: 0, top: 0.1, right: 0.6, bottom: 0.3 });
  });

  it('cannot follow a straightened photo, unless the step is off or zero', () => {
    expect(faceRectMapper([{ filter: 'straighten', angle: 3 }])).toBeNull();
    expect(faceRectMapper([{ filter: 'tilt', angle: 0.1, scale: 1 }])).toBeNull();
    expect(faceRectMapper([{ filter: 'straighten', angle: 3, enabled: false }])).not.toBeNull();
    expect(faceRectMapper([{ filter: 'straighten', angle: 0 }])).not.toBeNull();
  });

  it('ignores disabled steps', () => {
    expect(map([{ filter: 'rotate', angle: 90, enabled: false }])).toEqual(FACE);
  });
});

describe('helpers', () => {
  it('places a rectangle with percentages', () => {
    expect(rectStyle(FACE)).toEqual({ left: '10.000%', top: '20.000%', width: '20.000%', height: '30.000%' });
  });

});
