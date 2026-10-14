import type { ApiError } from '../../../shared/types.js';
import { apiError } from './apiError.js';
import { validateChain } from './editChain.js';
import { libraryLookup } from './libraryImages.js';
import { editsInvalid, getApiPhoto } from './photoApi.js';
import { PREVIEW_STEP_TIMEOUT_MS, RenderService } from './RenderService.js';
import { ThumbnailService, type ImageSize } from './ThumbnailService.js';
import { fileExists } from './files.js';

export const DEFAULT_PREVIEW_SIZE = 1200;
export const MAX_PREVIEW_SIZE = 4096;

export type ImageResult =
  | { status: 200; kind: 'buffer'; image: Buffer; type: string; fullSize?: { width: number; height: number } }
  | { status: 200; kind: 'file'; file: string; type?: string; cacheControl?: string }
  | { status: 400 | 404 | 500; body: ApiError };

async function photoFile(photoId: number) {
  const photo = await getApiPhoto(photoId);
  if (!photo) return { error: { status: 404 as const, body: apiError('photo_not_found', 'Photo not found') } };
  if (!await fileExists(photo.filePath)) return { error: { status: 404 as const, body: apiError('file_not_found', 'File missing') } };
  return { photo };
}

/**
 * `POST /api/photos/:id/preview`: the photo rendered through the given, unsaved steps and fitted within
 * `maxSize`×`maxSize`, as WebP (or JPEG), with the size the steps give at full resolution. The steps are validated
 * as when saving; nothing is saved.
 */
export async function renderPreview(photoId: number, body: unknown, format: 'webp' | 'jpeg' = 'webp'): Promise<ImageResult> {
  const value = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const check = validateChain(value.edits, libraryLookup);
  if (!check.ok) return { status: 400, body: editsInvalid(check.problem) };
  const maxSize = value.maxSize ?? DEFAULT_PREVIEW_SIZE;
  if (typeof maxSize !== 'number' || !Number.isInteger(maxSize) || maxSize < 16 || maxSize > MAX_PREVIEW_SIZE) {
    return { status: 400, body: apiError('invalid_field', `maxSize must be an integer from 16 to ${MAX_PREVIEW_SIZE}`, { field: 'maxSize' }) };
  }

  const found = await photoFile(photoId);
  if (found.error) return found.error;
  try {
    const rendered = await RenderService.renderWithSize(found.photo.filePath, check.steps, {
      lookup: libraryLookup,
      workingSize: RenderService.workingSizeFor(maxSize),
      stepTimeoutMs: PREVIEW_STEP_TIMEOUT_MS,
      label: found.photo.filePath,
    });
    const fitted = rendered.image.resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
    const image = await (format === 'jpeg' ? fitted.jpeg({ quality: 80 }) : fitted.webp({ quality: 85 })).toBuffer();
    return {
      status: 200, kind: 'buffer', image, type: `image/${format}`,
      fullSize: { width: rendered.fullWidth, height: rendered.fullHeight },
    };
  } catch (err) {
    // The error names the file; it stays in the server log
    console.error(`Failed to render a preview of ${found.photo.filePath}:`, err);
    return { status: 500, body: apiError('render_failed', 'Could not render the photo') };
  }
}

/** `GET /api/photos/:id/{thumbnail,preview}`: the photo's cached image as it looks with its saved edits. */
export async function photoImage(photoId: number, size: ImageSize): Promise<ImageResult> {
  const found = await photoFile(photoId);
  if (found.error) return found.error;
  try {
    const file = await ThumbnailService.getImage(found.photo, found.photo.edits, size, libraryLookup);
    return { status: 200, kind: 'file', file };
  } catch (err) {
    console.error(`Failed to render the ${size} of ${found.photo.filePath}:`, err);
    return { status: 500, body: apiError('render_failed', 'Could not render the photo') };
  }
}
