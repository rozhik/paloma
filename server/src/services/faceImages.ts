import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { apiError } from './apiError.js';
import { getApiPhoto } from './photoApi.js';
import { isRelativeRect } from './SidecarService.js';
import { findPerson } from './peopleApi.js';
import { avatarFace, isPersonVisible, rectFaces, shownPeople } from './people.js';
import type { ImageResult } from './renderApi.js';
import { ensureDir, fileExists } from './files.js';
import type { RelativeRect } from '../../../shared/types.js';

/** Longest side of the image face detection runs on. */
export const FACE_SOURCE_SIZE = 1280;
export const AVATAR_SIZE = 256;
export const DEFAULT_FACE_SIZE = 160;
export const MIN_FACE_SIZE = 32;
export const MAX_FACE_SIZE = 512;
/** Margin around a face in a crop, as a share of the face's width and height on each side. */
const MARGIN = 0.2;

export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The square around a face to crop from an image of `width`×`height`: the face rectangle with a margin on
 * each side, centred on the face, moved inside the image and made smaller when it does not fit.
 */
export function faceCropBox(rect: RelativeRect, width: number, height: number): PixelBox {
  const faceWidth = (rect.right - rect.left) * width;
  const faceHeight = (rect.bottom - rect.top) * height;
  const side = Math.max(faceWidth, faceHeight) * (1 + 2 * MARGIN);
  const size = Math.max(1, Math.min(Math.round(side), width, height));
  const centerX = ((rect.left + rect.right) / 2) * width;
  const centerY = ((rect.top + rect.bottom) / 2) * height;
  const clamp = (value: number, max: number) => Math.min(Math.max(Math.round(value), 0), max);
  return {
    left: clamp(centerX - size / 2, width - size),
    top: clamp(centerY - size / 2, height - size),
    width: size,
    height: size,
  };
}

/** Width and height of the image as shown, after its EXIF orientation. */
async function orientedSize(filePath: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(filePath, { failOnError: false }).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  return swap ? { width: height, height: width } : { width, height };
}

const inFlight = new Map<string, Promise<string>>();

/** Renders `target` once with `render`, writing it atomically; concurrent requests share the render. */
async function cached(target: string, render: () => Promise<sharp.Sharp>): Promise<string> {
  if (await fileExists(target)) return target;
  const running = inFlight.get(target);
  if (running) return running;
  const job = (async () => {
    const tmp = `${target}.${process.pid}.tmp`;
    await ensureDir(path.dirname(target));
    await (await render()).toFile(tmp);
    await fs.promises.rename(tmp, target);
    return target;
  })().finally(() => inFlight.delete(target));
  inFlight.set(target, job);
  return job;
}

const rectKey = (rect: RelativeRect) =>
  crypto.createHash('sha1').update([rect.left, rect.top, rect.right, rect.bottom].map((v) => v.toFixed(6)).join(',')).digest('hex').slice(0, 16);

/** A square JPEG crop around a face of the unedited, upright photo; cached by file content, rectangle and size. */
export async function renderFaceCrop(filePath: string, fileHash: string, rect: RelativeRect, size: number): Promise<string> {
  const target = path.join(config.cacheDir, `${fileHash}_face_${rectKey(rect)}_${size}.jpg`);
  return cached(target, async () => {
    const { width, height } = await orientedSize(filePath);
    const box = faceCropBox(rect, width, height);
    return sharp(filePath, { failOnError: false }).rotate().extract(box).resize(size, size).jpeg({ quality: 85 });
  });
}

/** The unedited photo, upright and at most FACE_SOURCE_SIZE on its longest side, for face detection. */
export async function renderFaceSource(filePath: string, fileHash: string): Promise<string> {
  const target = path.join(config.cacheDir, `${fileHash}_facesrc.jpg`);
  return cached(target, async () => sharp(filePath, { failOnError: false })
    .rotate()
    .resize({ width: FACE_SOURCE_SIZE, height: FACE_SOURCE_SIZE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }));
}

async function existingPhoto(photoId: number) {
  const photo = Number.isInteger(photoId) ? await getApiPhoto(photoId) : undefined;
  if (!photo) return { error: { status: 404 as const, body: apiError('photo_not_found', 'Photo not found') } };
  if (!await fileExists(photo.filePath)) return { error: { status: 404 as const, body: apiError('file_not_found', 'File missing') } };
  return { photo };
}

/** A `rect` query value `left,top,right,bottom`; undefined when it is not four fractions in order. */
export function parseRectQuery(value: unknown): RelativeRect | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4) return undefined;
  const [left, top, right, bottom] = parts;
  const rect = { left, top, right, bottom };
  return isRelativeRect(rect) && left < right && top < bottom ? rect : undefined;
}

// Face crops and detection images keep their URL when the photo file changes; avatars are addressed with
// their version, so a new avatar always gets a new URL
const SHORT_CACHE = 'private, max-age=3600';

async function sendFile(render: () => Promise<string>, label: string, cacheControl = SHORT_CACHE): Promise<ImageResult> {
  try {
    return { status: 200, kind: 'file', file: await render(), type: 'image/jpeg', cacheControl };
  } catch (err) {
    console.error(`Failed to render ${label}:`, err);
    return { status: 500, body: apiError('render_failed', 'Could not render the photo', { message: (err as Error).message }) };
  }
}

/** `GET /api/photos/:id/face?rect=l,t,r,b&size=160`: a face crop of the unedited photo. */
export async function photoFace(photoId: number, query: { rect?: unknown; size?: unknown }): Promise<ImageResult> {
  const rect = parseRectQuery(query.rect);
  if (!rect) return { status: 400, body: apiError('invalid_field', 'rect must be left,top,right,bottom fractions', { field: 'rect' }) };
  const size = query.size === undefined ? DEFAULT_FACE_SIZE : Number(query.size);
  if (!Number.isInteger(size) || size < MIN_FACE_SIZE || size > MAX_FACE_SIZE) {
    return { status: 400, body: apiError('invalid_field', `size must be an integer from ${MIN_FACE_SIZE} to ${MAX_FACE_SIZE}`, { field: 'size' }) };
  }
  const found = await existingPhoto(photoId);
  if (found.error) return found.error;
  return sendFile(() => renderFaceCrop(found.photo.filePath, found.photo.fileHash, rect, size), found.photo.filePath);
}

/** `GET /api/photos/:id/face-source`: the image face detection runs on. */
export async function photoFaceSource(photoId: number): Promise<ImageResult> {
  const found = await existingPhoto(photoId);
  if (found.error) return found.error;
  return sendFile(() => renderFaceSource(found.photo.filePath, found.photo.fileHash), found.photo.filePath);
}

/** `GET /api/people/:id/avatar`: the person's avatar crop, or 404 when they have no face with a rectangle. */
export async function personAvatar(id: string): Promise<ImageResult> {
  if (!await findPerson(id) || !await isPersonVisible(id)) return { status: 404, body: apiError('person_not_found', 'Person not found') };
  const face = avatarFace((await shownPeople([id])).get(id)!.row, await rectFaces(id));
  if (!face) return { status: 404, body: apiError('face_not_found', 'The person has no face to show') };
  const filePath = path.join(face.folderPath, face.filename);
  if (!await fileExists(filePath)) return { status: 404, body: apiError('file_not_found', 'File missing') };
  return sendFile(() => renderFaceCrop(filePath, face.fileHash, face.rect, AVATAR_SIZE), filePath, 'private, max-age=31536000, immutable');
}
