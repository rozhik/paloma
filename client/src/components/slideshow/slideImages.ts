import type { Photo } from '../../../../shared/types.js';
import type { SlideshowFit } from '../../settings/uiSettings.js';
import type { Size } from '../viewer/zoomMath.js';
import { renderSizeFor } from './slideSize.js';

/** An image ready to be shown: decoded, with the photo's full size as it looks with its edits. */
export interface SlideImage {
  url: string;
  full: Size;
  /** Object URL of a rendering, revoked when it leaves the cache */
  owned: boolean;
}

/** How many images are kept: the outgoing, the shown, the incoming and the next one. */
const KEEP = 5;

/**
 * Loads slideshow images: the cached preview, or a sharper rendering when the photo size needs one (as the viewer
 * does when zooming). A rendering that fails, for example for a role that may not render, falls back to the preview.
 */
export class SlideImages {
  private cache = new Map<string, Promise<SlideImage>>();
  private renderDenied = false;

  load(photo: Photo, fit: SlideshowFit, screen: Size, pixelRatio: number): Promise<SlideImage> {
    const known = { width: photo.width || 1, height: photo.height || 1 };
    const size = this.renderDenied ? null : renderSizeFor(fit, known, screen, pixelRatio);
    const key = `${photo.id}:${size ?? 'preview'}:${JSON.stringify(photo.edits ?? [])}`;
    let image = this.cache.get(key);
    if (!image) {
      image = (size === null ? Promise.reject(new Error('preview')) : this.render(photo, size))
        .catch(() => ({ url: photo.previewUrl ?? photo.thumbnailUrl ?? '', full: known, owned: false }))
        .then(async (loaded) => {
          const natural = await decode(loaded.url);
          if (loaded.owned || !natural) return loaded;
          // The preview has the look's proportions (a crop or a rotation changes them); the file has the size
          const width = Math.max(known.width, known.height) * (natural.width >= natural.height ? 1 : natural.width / natural.height);
          return { ...loaded, full: { width, height: width * natural.height / natural.width } };
        });
      this.cache.set(key, image);
      this.trim();
    } else {
      // Recently used: keep it longest
      this.cache.delete(key);
      this.cache.set(key, image);
    }
    return image;
  }

  /** Revokes every rendering; the slideshow has ended. */
  dispose(): void {
    for (const image of this.cache.values()) void image.then(revoke);
    this.cache.clear();
  }

  private async render(photo: Photo, maxSize: number): Promise<SlideImage> {
    const res = await fetch(`/api/photos/${photo.id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: photo.edits ?? [], maxSize }),
    });
    if (res.status === 401 || res.status === 403) this.renderDenied = true;
    if (!res.ok) throw new Error(`preview ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const width = Number(res.headers.get('X-Paloma-Full-Width')) || photo.width || 1;
    const height = Number(res.headers.get('X-Paloma-Full-Height')) || photo.height || 1;
    return { url, full: { width, height }, owned: true };
  }

  private trim(): void {
    while (this.cache.size > KEEP) {
      const oldest = this.cache.keys().next().value as string;
      // Revoked a little later, so a layer still fading out keeps its image
      const image = this.cache.get(oldest)!;
      this.cache.delete(oldest);
      void image.then((loaded) => setTimeout(() => revoke(loaded), 5000));
    }
  }
}

function revoke(image: SlideImage): void {
  if (image.owned) URL.revokeObjectURL(image.url);
}

/**
 * Waits until the image can be painted and returns its pixel size; an image that fails is shown anyway, as the
 * browser draws it, and has no size.
 */
async function decode(url: string): Promise<Size | null> {
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null;
  } catch {
    // Broken or not decodable ahead: show it as it comes
    return null;
  }
}
