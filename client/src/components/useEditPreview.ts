import { useEffect, useRef, useState } from 'react';
import type { EditStep } from '../../../shared/types.js';
import { ApiRequestError } from '../api/http.js';

const DEBOUNCE_MS = 150;
const CACHE_SIZE = 12;
export const MAX_PREVIEW_SIZE = 2048;

export interface EditPreview {
  /** Object URL of the latest rendered preview; kept while the next one loads */
  url: string | null;
  /** Pixel size of that preview */
  width: number;
  height: number;
  loading: boolean;
  error: unknown;
}

/** Preview size for a box on screen: its longer side in device pixels, in steps of 256, at most 2048. */
export function previewSizeFor(boxWidth: number, boxHeight: number, pixelRatio: number): number {
  const needed = Math.max(boxWidth, boxHeight, 256) * pixelRatio;
  return Math.min(MAX_PREVIEW_SIZE, Math.ceil(needed / 256) * 256);
}

interface Cached {
  url: string;
  width: number;
  height: number;
}

/**
 * The photo rendered by the server through `steps`, which are not saved. Requests wait until changes pause
 * for a moment, and a newer request cancels the older one. Recent results are kept for instant switching,
 * for example while "Show original" is held.
 */
export function useEditPreview(photoId: number, steps: EditStep[], maxSize: number): EditPreview {
  const [preview, setPreview] = useState<EditPreview>({ url: null, width: 0, height: 0, loading: true, error: null });
  const cache = useRef(new Map<string, Cached>());
  const key = JSON.stringify([steps, maxSize]);

  useEffect(() => {
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
        if (controller.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        remember(cache.current, key, { url, width, height });
        setPreview({ url, width, height, loading: false, error: null });
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
