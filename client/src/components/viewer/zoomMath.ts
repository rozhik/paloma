/**
 * Zoom and pan of a photo in the viewer's stage. `scale` is screen CSS pixels per full-size photo pixel
 * (1 = 100%), and `x`, `y` is the offset of the photo's centre from the stage's centre, in CSS pixels.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

/** Largest zoom: 400% of the photo's actual pixels */
export const MAX_SCALE = 4;
/** Step of the zoom buttons and the + and - keys */
export const ZOOM_STEP = 1.25;
/** How strongly one unit of wheel delta zooms */
const WHEEL_SENSITIVITY = 0.002;

/** Scale at which the whole photo fits the stage; a photo smaller than the stage stays at 100%. */
export function fitScale(photo: Size, stage: Size): number {
  if (photo.width <= 0 || photo.height <= 0 || stage.width <= 0 || stage.height <= 0) return 1;
  return Math.min(stage.width / photo.width, stage.height / photo.height, 1);
}

/** The photo fitted and centred. */
export function fitted(photo: Size, stage: Size): ZoomState {
  return { scale: fitScale(photo, stage), x: 0, y: 0 };
}

export function clampScale(scale: number, photo: Size, stage: Size): number {
  const min = fitScale(photo, stage);
  return Math.min(Math.max(scale, min), Math.max(MAX_SCALE, min));
}

/**
 * Keeps the photo from moving further than needed to bring an edge to the matching stage edge, and
 * centres it along an axis where it fits.
 */
export function clampPan(state: ZoomState, photo: Size, stage: Size): ZoomState {
  const limitX = Math.max(0, (photo.width * state.scale - stage.width) / 2);
  const limitY = Math.max(0, (photo.height * state.scale - stage.height) / 2);
  const clamp = (value: number, limit: number) => (limit === 0 ? 0 : Math.min(Math.max(value, -limit), limit));
  return { scale: state.scale, x: clamp(state.x, limitX), y: clamp(state.y, limitY) };
}

/**
 * Zooms to `scale` keeping the photo point under `anchor` in place. `anchor` is relative to the stage's
 * centre; leave it out to zoom around the centre.
 */
export function zoomAt(state: ZoomState, scale: number, photo: Size, stage: Size, anchor: Point = { x: 0, y: 0 }): ZoomState {
  const next = clampScale(scale, photo, stage);
  const ratio = next / state.scale;
  return clampPan({
    scale: next,
    x: anchor.x - (anchor.x - state.x) * ratio,
    y: anchor.y - (anchor.y - state.y) * ratio,
  }, photo, stage);
}

/** Zoom factor for a wheel event's `deltaY` (negative = zoom in); pinch on a trackpad arrives the same way. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_SENSITIVITY);
}

/** Moves the photo by a drag of `dx`, `dy` CSS pixels. */
export function panBy(state: ZoomState, dx: number, dy: number, photo: Size, stage: Size): ZoomState {
  return clampPan({ scale: state.scale, x: state.x + dx, y: state.y + dy }, photo, stage);
}

/** Whether the state shows the photo fitted (within rounding). */
export function isFitted(state: ZoomState, photo: Size, stage: Size): boolean {
  return Math.abs(state.scale - fitScale(photo, stage)) < 1e-6;
}

/** After the stage changed size: a fitted photo is fitted again, otherwise the zoom is kept and re-clamped. */
export function resized(state: ZoomState, photo: Size, before: Size, after: Size): ZoomState {
  if (isFitted(state, photo, before)) return fitted(photo, after);
  return clampPan({ ...state, scale: clampScale(state.scale, photo, after) }, photo, after);
}

/** Double-click: a fitted photo goes to 100% at the clicked point, any other zoom back to fitted. */
export function toggleZoom(state: ZoomState, photo: Size, stage: Size, anchor: Point): ZoomState {
  return isFitted(state, photo, stage) ? zoomAt(state, 1, photo, stage, anchor) : fitted(photo, stage);
}
