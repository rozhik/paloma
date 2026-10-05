import type { Photo } from '../../../../shared/types.js';

/** Where a slideshow of the grid's photos starts: the first selected photo in grid order, else the first. */
export function slideshowStart(photos: Photo[], selected: Photo[]): number {
  const ids = new Set(selected.map((photo) => photo.id));
  return Math.max(0, photos.findIndex((photo) => ids.has(photo.id)));
}
