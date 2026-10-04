import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

if (!fs.existsSync(config.cacheDir)) {
  fs.mkdirSync(config.cacheDir, { recursive: true });
}

export class ThumbnailService {
  public static getCacheDir(): string {
    return config.cacheDir;
  }

  public static getThumbnailPath(fileHash: string, size: 'thumb' | 'preview'): string {
    const filename = `${fileHash}_${size}.webp`;
    return path.join(config.cacheDir, filename);
  }

  public static async generateThumbnails(filePath: string, fileHash: string): Promise<{ width: number; height: number }> {
    const thumbPath = this.getThumbnailPath(fileHash, 'thumb');
    const previewPath = this.getThumbnailPath(fileHash, 'preview');

    const image = sharp(filePath, { failOnError: false }).rotate(); // auto-rotate based on EXIF
    const metadata = await image.metadata();

    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    if (!fs.existsSync(thumbPath)) {
      await image
        .clone()
        .resize({ width: 250, height: 250, fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(thumbPath);
    }

    if (!fs.existsSync(previewPath)) {
      await image
        .clone()
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(previewPath);
    }

    return { width: origWidth, height: origHeight };
  }
}
