import fs from 'node:fs';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import XXH from 'xxhashjs';

export interface PhotoMetadata {
  fileHash: string;
  width: number;
  height: number;
  fileSize: number;
  dateTaken: string | null;
  latitude: number | null;
  longitude: number | null;
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

    try {
      const image = sharp(filePath, { failOnError: false });
      const metadata = await image.metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;

      if (metadata.exif) {
        try {
          const parsedExif = exifReader(metadata.exif);
          if (parsedExif.Photo?.DateTimeOriginal) {
            dateTaken = new Date(parsedExif.Photo.DateTimeOriginal).toISOString();
          } else if (parsedExif.Image?.DateTime) {
            dateTaken = new Date(parsedExif.Image.DateTime).toISOString();
          }

          const gps = (parsedExif as any).gps || (parsedExif as any).GPS;
          if (gps?.GPSLatitude && gps?.GPSLongitude) {
            const lat = gps.GPSLatitude;
            const lon = gps.GPSLongitude;
            if (Array.isArray(lat) && lat.length >= 3) {
              const calcLat = lat[0] + lat[1] / 60 + lat[2] / 3600;
              latitude = gps.GPSLatitudeRef === 'S' ? -calcLat : calcLat;
            }
            if (Array.isArray(lon) && lon.length >= 3) {
              const calcLon = lon[0] + lon[1] / 60 + lon[2] / 3600;
              longitude = gps.GPSLongitudeRef === 'W' ? -calcLon : calcLon;
            }
          }
        } catch {
          // EXIF parsing fallback
        }
      }
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
    };
  }
}
