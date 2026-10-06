import fs from 'node:fs';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import XXH from 'xxhashjs';
import { cameraText, combineEmbeddedText, readExifText, readIptcText, readXmpText, type TextFields } from './embeddedText.js';

/** Bumped when parsing improves; photos read by an older version are read again on the next scan. */
export const METADATA_VERSION = 2;

export interface PhotoMetadata {
  fileHash: string;
  width: number;
  height: number;
  fileSize: number;
  dateTaken: string | null;
  /** Camera location from EXIF GPS */
  latitude: number | null;
  longitude: number | null;
  /** Description embedded in the file (XMP, IPTC, EXIF); null without one */
  caption: string | null;
  /** Tags embedded in the file; empty without them */
  keywords: string[];
  cameraMake: string | null;
  cameraModel: string | null;
}

type GpsInfo = ReturnType<typeof exifReader>['GPSInfo'];

/** Signed decimal degrees from EXIF degrees/minutes/seconds and a hemisphere ref; null when malformed. */
function toDegrees(dms: unknown, ref: unknown, negativeRef: 'S' | 'W'): number | null {
  if (!Array.isArray(dms) || dms.length === 0 || dms.length > 3) return null;
  if (!dms.every((part) => typeof part === 'number' && Number.isFinite(part) && part >= 0)) return null;
  const [degrees, minutes = 0, seconds = 0] = dms as number[];
  const value = degrees + minutes / 60 + seconds / 3600;
  return typeof ref === 'string' && ref.trim().toUpperCase() === negativeRef ? -value : value;
}

/**
 * The camera location from the EXIF GPS block (`GPSInfo` in exif-reader 2.x), in decimal degrees.
 * Out-of-range coordinates and the 0,0 that some cameras write without a fix count as no location.
 */
export function gpsLocation(gps: GpsInfo): { latitude: number; longitude: number } | null {
  if (!gps) return null;
  const latitude = toDegrees(gps.GPSLatitude, gps.GPSLatitudeRef, 'S');
  const longitude = toDegrees(gps.GPSLongitude, gps.GPSLongitudeRef, 'W');
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export class MetadataService {
  public static calculateFileHash(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    // Use XXH64 for fast file hash calculation
    const hash = XXH.h64(buffer, 0xabcd).toString(16);
    return hash;
  }

  public static async extractMetadata(filePath: string): Promise<PhotoMetadata> {
    const stats = fs.statSync(filePath);
    const fileHash = this.calculateFileHash(filePath);

    let width = 0;
    let height = 0;
    let dateTaken: string | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;
    let exifText: TextFields = {};
    let cameraMake: string | null = null;
    let cameraModel: string | null = null;
    let xmpText: TextFields = {};
    let iptcText: TextFields = {};

    try {
      const image = sharp(filePath, { failOnError: false });
      const metadata = await image.metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;

      if (metadata.exif) {
        try {
          const parsedExif = exifReader(metadata.exif);
          // Before the date: an invalid date throws and must not cost the photo its location
          const location = gpsLocation(parsedExif.GPSInfo);
          if (location) ({ latitude, longitude } = location);
          const image = parsedExif.Image as Record<string, unknown> | undefined;
          exifText = readExifText(image);
          cameraMake = cameraText(image?.Make);
          cameraModel = cameraText(image?.Model);

          if (parsedExif.Photo?.DateTimeOriginal) {
            dateTaken = new Date(parsedExif.Photo.DateTimeOriginal).toISOString();
          } else if (parsedExif.Image?.DateTime) {
            dateTaken = new Date(parsedExif.Image.DateTime).toISOString();
          }
        } catch {
          // EXIF parsing fallback
        }
      }
      // Each block on its own: a broken one must not hide the others
      try { xmpText = readXmpText(metadata.xmp); } catch { /* no XMP text */ }
      try { iptcText = readIptcText(metadata.iptc); } catch { /* no IPTC text */ }
    } catch {
      // Fallback
    }

    if (!dateTaken) {
      dateTaken = stats.mtime.toISOString();
    }

    return {
      fileHash,
      width,
      height,
      fileSize: stats.size,
      dateTaken,
      latitude,
      longitude,
      ...combineEmbeddedText([xmpText, iptcText, exifText]),
      cameraMake,
      cameraModel,
    };
  }
}
