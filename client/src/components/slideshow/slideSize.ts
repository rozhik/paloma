import type { SlideshowFit } from '../../settings/uiSettings.js';
import { fitScale, type Size } from '../viewer/zoomMath.js';
import { previewSizeFor } from '../useEditPreview.js';

/** Long side of the cached preview every photo has; a larger box needs a rendering of its own. */
export const CACHED_PREVIEW_SIZE = 800;

/** Scale (screen CSS pixels per photo pixel) at which a photo of `full` size is shown on `screen`. */
export function slideScale(fit: SlideshowFit, full: Size, screen: Size): number {
  switch (fit) {
    case 'fit':
      return Math.min(screen.width / full.width, screen.height / full.height);
    case 'fitNoEnlarge':
      return fitScale(full, screen);
    case 'fill':
      return Math.max(screen.width / full.width, screen.height / full.height);
    case 'actual':
      return 1;
  }
}

/** The photo's box on screen in CSS pixels, centred; larger than the screen when it is cropped. */
export function slideBox(fit: SlideshowFit, full: Size, screen: Size): Size {
  if (full.width <= 0 || full.height <= 0 || screen.width <= 0 || screen.height <= 0) return screen;
  const scale = slideScale(fit, full, screen);
  return { width: full.width * scale, height: full.height * scale };
}

/** The rendering size to ask for, or null when the cached preview is sharp enough. */
export function renderSizeFor(fit: SlideshowFit, full: Size, screen: Size, pixelRatio: number): number | null {
  const box = slideBox(fit, full, screen);
  const needed = previewSizeFor(Math.min(box.width, full.width), Math.min(box.height, full.height), pixelRatio);
  return needed > CACHED_PREVIEW_SIZE ? needed : null;
}
