import type { EditStep, RelativeRect } from '../../../../shared/types.js';

/** Steps that turn or warp the picture so a rectangle cannot follow it. */
const WARPING = new Set(['straighten', 'tilt']);

type RectMap = (rect: RelativeRect) => RelativeRect | undefined;

const isRect = (value: unknown): value is RelativeRect =>
  typeof value === 'object' && value !== null
  && ['left', 'top', 'right', 'bottom'].every((key) => typeof (value as Record<string, unknown>)[key] === 'number');

/** Rotates a rectangle by quarter turns clockwise, as the rotate filter turns the picture. */
function rotate(rect: RelativeRect, angle: number): RelativeRect {
  const { left, top, right, bottom } = rect;
  switch (((angle % 360) + 360) % 360) {
    case 90: return { left: 1 - bottom, top: left, right: 1 - top, bottom: right };
    case 180: return { left: 1 - right, top: 1 - bottom, right: 1 - left, bottom: 1 - top };
    case 270: return { left: top, top: 1 - right, right: bottom, bottom: 1 - left };
    default: return rect;
  }
}

function flip(rect: RelativeRect, direction: unknown): RelativeRect {
  return direction === 'vertical'
    ? { ...rect, top: 1 - rect.bottom, bottom: 1 - rect.top }
    : { ...rect, left: 1 - rect.right, right: 1 - rect.left };
}

/** The part of a rectangle inside a crop, in the cropped picture's fractions; undefined when none of it is. */
function crop(rect: RelativeRect, frame: RelativeRect): RelativeRect | undefined {
  const width = frame.right - frame.left;
  const height = frame.bottom - frame.top;
  if (width <= 0 || height <= 0) return undefined;
  const clip = (value: number) => Math.min(Math.max(value, 0), 1);
  const mapped = {
    left: clip((rect.left - frame.left) / width),
    top: clip((rect.top - frame.top) / height),
    right: clip((rect.right - frame.left) / width),
    bottom: clip((rect.bottom - frame.top) / height),
  };
  return mapped.right - mapped.left > 1e-3 && mapped.bottom - mapped.top > 1e-3 ? mapped : undefined;
}

/**
 * How face rectangles of the unedited photo land on the picture its edits make: through the crop, rotate and
 * flip steps, in order, with colour and effect steps left out. Null when an enabled step warps the picture
 * (straighten), so no frame can be drawn; the map gives undefined for a face cropped away.
 */
export function faceRectMapper(steps: readonly EditStep[]): RectMap | null {
  const maps: RectMap[] = [];
  for (const step of steps) {
    if (step.enabled === false) continue;
    if (WARPING.has(step.filter)) {
      if (step.filter === 'straighten' && (step.angle === 0 || step.angle === undefined)) continue;
      return null;
    }
    if (step.filter === 'crop64' || step.filter === 'crop') {
      if (isRect(step.rect)) {
        const frame = step.rect;
        maps.push((rect) => crop(rect, frame));
      }
    } else if (step.filter === 'rotate') {
      const angle = typeof step.angle === 'number' ? step.angle : 90;
      maps.push((rect) => rotate(rect, angle));
    } else if (step.filter === 'flip') {
      const direction = step.direction ?? 'horizontal';
      maps.push((rect) => flip(rect, direction));
    }
  }
  return (rect) => maps.reduce<RelativeRect | undefined>((current, map) => (current ? map(current) : undefined), rect);
}

/** A rectangle as CSS percentages of the box it is drawn in. */
export function rectStyle(rect: RelativeRect): { left: string; top: string; width: string; height: string } {
  const percent = (value: number) => `${(value * 100).toFixed(3)}%`;
  return { left: percent(rect.left), top: percent(rect.top), width: percent(rect.right - rect.left), height: percent(rect.bottom - rect.top) };
}
