import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { geoPlaces, photos } from '../db/schema.js';
import { apiError } from './apiError.js';
import { getApiPhoto, type ApiResult } from './photoApi.js';
import { shownAlbumTexts } from './albumApi.js';
import { peopleOnPhoto, unassignedFaces } from './people.js';
import { normalizeLang } from './placeCache.js';
import { SidecarService } from './SidecarService.js';
import { readPicasaIni } from './picasaIni.js';
import type { ExifValue, PhotoInfo } from '../../../shared/types.js';

/** Longest EXIF text shown; longer values are cut with an ellipsis. */
export const MAX_EXIF_TEXT = 2000;
/** Number lists longer than this are binary data in disguise (e.g. Windows XP tags, maker data). */
const MAX_NUMBER_LIST = 64;

/** An EXIF value as text, or the size of a binary value. */
export function exifValueText(value: unknown): ExifValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return { binary: value.length };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) {
    if (value.length > MAX_NUMBER_LIST && value.every((item) => typeof item === 'number')) return { binary: value.length };
    return cut(value.map((item) => (item instanceof Date ? item.toISOString() : String(item))).join(', '));
  }
  if (typeof value === 'object') return cut(JSON.stringify(value));
  return cut(String(value));
}

const cut = (text: string): string => (text.length > MAX_EXIF_TEXT ? `${text.slice(0, MAX_EXIF_TEXT)}…` : text);

/** Every EXIF field of the file by group (`Image`, `Photo`, `GPSInfo`, `Iop`, ...); null without EXIF. */
export async function readExifFields(filePath: string): Promise<PhotoInfo['exif']> {
  let exif: Buffer | undefined;
  try {
    exif = (await sharp(filePath, { failOnError: false }).metadata()).exif;
  } catch {
    return null;
  }
  if (!exif) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = exifReader(exif) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
  const groups: NonNullable<PhotoInfo['exif']> = {};
  for (const [group, tags] of Object.entries(parsed)) {
    if (typeof tags !== 'object' || tags === null || tags instanceof Uint8Array) continue;
    const fields: Record<string, ExifValue> = {};
    for (const [tag, value] of Object.entries(tags)) {
      const text = exifValueText(value);
      if (text !== null) fields[tag] = text;
    }
    if (Object.keys(fields).length > 0) groups[group] = fields;
  }
  return Object.keys(groups).length > 0 ? groups : null;
}

/** The photo's entry as stored in `.paloma.json`, or as read from the Picasa .ini while there is no sidecar. */
export function sidecarEntry(dir: string, filename: string): PhotoInfo['entry'] {
  const sidecar = SidecarService.readFolderSidecar(dir);
  if (sidecar.kind === 'unreadable') return { source: 'unreadable' };
  if (sidecar.kind === 'ok') {
    const entry = sidecar.data.photos[filename];
    return entry ? { source: 'paloma', json: entry } : { source: 'none' };
  }
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return { source: 'none' };
  }
  const ini = readPicasaIni(dir, names);
  if (ini.kind !== 'ok') return { source: 'none' };
  const fields = SidecarService.matchSections(ini.sections, names)[filename];
  return fields ? { source: 'ini', json: { ...fields } } : { source: 'none' };
}

/** `GET /api/photos/:id/info`: everything the Info panel shows. Reads the photo file and its folder files only. */
export async function getPhotoInfo(photoId: number, lang: unknown): Promise<ApiResult<PhotoInfo>> {
  const photo = Number.isInteger(photoId) ? getApiPhoto(photoId) : undefined;
  if (!photo?.folderPath) return { status: 404, body: apiError('photo_not_found', 'Photo not found') };

  let file: PhotoInfo['file'] = { path: photo.filePath, size: photo.fileSize, modifiedAt: null };
  try {
    const stat = fs.statSync(photo.filePath);
    file = { path: photo.filePath, size: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch {
    // A file that just disappeared keeps the indexed size
  }

  const albumTexts = shownAlbumTexts();
  const language = lang === undefined ? '' : normalizeLang(lang);
  const place = language
    ? db.select({ name: geoPlaces.name })
      .from(photos)
      .innerJoin(geoPlaces, and(eq(geoPlaces.cell, photos.geoCell), eq(geoPlaces.lang, language)))
      .where(eq(photos.id, photoId))
      .get()?.name ?? null
    : null;

  return {
    status: 200,
    body: {
      photo: { ...photo, place },
      file,
      albums: photo.albums.map((token) => ({ token, name: albumTexts.get(token)?.name ?? null })),
      people: peopleOnPhoto(photoId),
      faces: unassignedFaces(photoId),
      place,
      exif: await readExifFields(photo.filePath),
      entry: sidecarEntry(path.dirname(photo.filePath), photo.filename),
    },
  };
}
