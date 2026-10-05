import type { RelativeRect } from '../../../shared/types.js';

/** A corner of the crop frame. */
export type Handle = 'nw' | 'ne' | 'sw' | 'se';

/** Crop ratios offered in the editor: free, the photo's own, or width:height in pixels. */
export type CropRatio = 'free' | 'original' | readonly [number, number];

export const CROP_RATIOS: readonly CropRatio[] = ['free', 'original', [1, 1], [4, 3], [3, 2], [16, 9]];

/** Smallest frame side, as a fraction of the image */
export const MIN_SIDE = 0.02;

export const FULL_FRAME: RelativeRect = { left: 0, top: 0, right: 1, bottom: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 1e6) / 1e6;

export function roundRect(rect: RelativeRect): RelativeRect {
  return { left: round(rect.left), top: round(rect.top), right: round(rect.right), bottom: round(rect.bottom) };
}

/**
 * The frame's width:height in pixels for a ratio, or null for free. `photoAspect` is the photo's own
 * width/height; `portrait` turns a landscape ratio upright.
 */
export function pixelRatio(ratio: CropRatio, photoAspect: number, portrait: boolean): number | null {
  if (ratio === 'free') return null;
  const value = ratio === 'original' ? photoAspect : ratio[0] / ratio[1];
  const landscape = value >= 1 ? value : 1 / value;
  return portrait ? 1 / landscape : landscape;
}

/** Width/height of the frame in fractions, for a pixel ratio on an image of aspect `imageAspect`. */
const fractionRatio = (ratio: number, imageAspect: number) => ratio / imageAspect;

/** The largest frame with the ratio, centred in `rect`. A null ratio keeps `rect`. */
export function fitRatio(rect: RelativeRect, ratio: number | null, imageAspect: number): RelativeRect {
  if (ratio === null) return rect;
  const k = fractionRatio(ratio, imageAspect);
  let width = rect.right - rect.left;
  let height = rect.bottom - rect.top;
  if (width / height > k) width = height * k; else height = width / k;
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  return roundRect({ left: cx - width / 2, top: cy - height / 2, right: cx + width / 2, bottom: cy + height / 2 });
}

/**
 * The frame after dragging a corner to `point` (fractions of the image), keeping the opposite corner fixed,
 * the frame inside the image, at least MIN_SIDE wide and high, and at the ratio when one is set.
 */
export function dragCorner(
  rect: RelativeRect, handle: Handle, point: { x: number; y: number }, ratio: number | null, imageAspect: number,
): RelativeRect {
  const anchorX = handle.includes('w') ? rect.right : rect.left;
  const anchorY = handle.includes('n') ? rect.bottom : rect.top;
  const dirX = handle.includes('w') ? -1 : 1;
  const dirY = handle.includes('n') ? -1 : 1;

  // Room from the anchor to the image edge in the drag direction
  const roomX = dirX > 0 ? 1 - anchorX : anchorX;
  const roomY = dirY > 0 ? 1 - anchorY : anchorY;
  let width = clamp((clamp(point.x, 0, 1) - anchorX) * dirX, MIN_SIDE, roomX);
  let height = clamp((clamp(point.y, 0, 1) - anchorY) * dirY, MIN_SIDE, roomY);

  if (ratio !== null) {
    const k = fractionRatio(ratio, imageAspect);
    if (width / height > k) width = height * k; else height = width / k;
    // Keep within the room after fitting the ratio
    if (width > roomX) { width = roomX; height = width / k; }
    if (height > roomY) { height = roomY; width = height * k; }
  }

  const left = dirX > 0 ? anchorX : anchorX - width;
  const top = dirY > 0 ? anchorY : anchorY - height;
  return roundRect({ left, top, right: left + width, bottom: top + height });
}

/** The frame moved by (dx, dy) fractions, staying inside the image. */
export function moveFrame(rect: RelativeRect, dx: number, dy: number): RelativeRect {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const left = clamp(rect.left + dx, 0, 1 - width);
  const top = clamp(rect.top + dy, 0, 1 - height);
  return roundRect({ left, top, right: left + width, bottom: top + height });
}
