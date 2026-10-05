import { useEffect, useRef, useState } from 'react';
import type { EditStep } from '../../../shared/types.js';
import { ApiRequestError } from '../api/http.js';

const DEBOUNCE_MS = 150;
const CACHE_SIZE = 12;
/** The server's limit for `maxSize` */
export const MAX_PREVIEW_SIZE = 4096;

export interface EditPreview {
  /** Object URL of the latest rendered preview; kept while the next one loads */
  url: string | null;
  /** Pixel size of that preview */
  width: number;
  height: number;
  /** Size the same steps give at full resolution, as the server reports it */
  fullWidth: number;
  fullHeight: number;
  loading: boolean;
  error: unknown;
}

/** Preview size for a box on screen: its longer side in device pixels, in steps of 256, at most 4096. */
export function previewSizeFor(boxWidth: number, boxHeight: number, pixelRatio: number): number {
  const needed = Math.max(boxWidth, boxHeight, 256) * pixelRatio;
  return Math.min(MAX_PREVIEW_SIZE, Math.ceil(needed / 256) * 256);
}

interface Cached {
  url: string;
  width: number;
  height: number;
  fullWidth: number;
  fullHeight: number;
}

/**
 * The photo rendered by the server through `steps`, which are not saved. Requests wait until changes pause
 * for a moment, and a newer request cancels the older one. Recent results are kept for instant switching,
 * for example while "Show original" is held.
 */
const EMPTY: EditPreview = { url: null, width: 0, height: 0, fullWidth: 0, fullHeight: 0, loading: true, error: null };

export function useEditPreview(photoId: number, steps: EditStep[], maxSize: number): EditPreview {
  const [preview, setPreview] = useState<EditPreview>(EMPTY);
  const cache = useRef(new Map<string, Cached>());
  const shownPhoto = useRef(photoId);
  const key = JSON.stringify([steps, maxSize]);

  useEffect(() => {
    // Another photo: its predecessor's image is no longer valid (and its object URL is revoked)
    if (shownPhoto.current !== photoId) {
      shownPhoto.current = photoId;
      setPreview(EMPTY);
    }
    const cached = cache.current.get(key);
    if (cached) {
      setPreview({ ...cached, loading: false, error: null });
      return;
    }
    setPreview((current) => ({ ...current, loading: true, error: null }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/photos/${photoId}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edits: steps, maxSize }),
          signal: controller.signal,
        });
        if (!res.ok) throw new ApiRequestError(res.status, await res.json().catch(() => null));
        const url = URL.createObjectURL(await res.blob());
        const { width, height } = await imageSize(url);
        // Older servers do not send the full size; the preview's own size is the best guess then
        const fullWidth = Number(res.headers.get('X-Paloma-Full-Width')) || width;
        const fullHeight = Number(res.headers.get('X-Paloma-Full-Height')) || height;
        if (controller.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        remember(cache.current, key, { url, width, height, fullWidth, fullHeight });
        setPreview({ url, width, height, fullWidth, fullHeight, loading: false, error: null });
      } catch (err) {
        if (!controller.signal.aborted) setPreview((current) => ({ ...current, loading: false, error: err }));
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [photoId, key]);

  useEffect(() => () => {
    for (const entry of cache.current.values()) URL.revokeObjectURL(entry.url);
    cache.current.clear();
  }, [photoId]);

  return preview;
}

function remember(cache: Map<string, Cached>, key: string, entry: Cached): void {
  cache.set(key, entry);
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value as string;
    URL.revokeObjectURL(cache.get(oldest)!.url);
    cache.delete(oldest);
  }
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('The preview could not be decoded'));
    img.src = url;
  });
}
