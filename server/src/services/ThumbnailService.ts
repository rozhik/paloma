import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import type { EditStep } from '../../../shared/types.js';
import type { FilterLookup } from './editChain.js';
import { PREVIEW_STEP_TIMEOUT_MS, RenderService } from './RenderService.js';
import { renderKey } from './photoImages.js';

if (!fs.existsSync(config.cacheDir)) {
  fs.mkdirSync(config.cacheDir, { recursive: true });
}

export type ImageSize = 'thumb' | 'preview';

const SIZES: Record<ImageSize, { box: number; encode: (image: sharp.Sharp) => sharp.Sharp }> = {
  thumb: {
    box: 250,
    encode: (image) => image.resize({ width: 250, height: 250, fit: 'cover' }).webp({ quality: 80 }),
  },
  preview: {
    box: 800,
    encode: (image) => image.resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }),
  },
};

export class ThumbnailService {
  /** Renders in progress by target file, so concurrent requests for one image render it once */
  private static inFlight = new Map<string, Promise<string>>();

  public static getCacheDir(): string {
    return config.cacheDir;
  }

  public static getThumbnailPath(fileHash: string, size: ImageSize): string {
    const filename = `${fileHash}_${size}.webp`;
    return path.join(config.cacheDir, filename);
  }

  /** Path of a photo's image rendered through the edit chain identified by `key`. */
  public static getRenderedPath(fileHash: string, key: string, size: ImageSize): string {
    return path.join(config.cacheDir, `${fileHash}_${key}_${size}.webp`);
  }

  public static async generateThumbnails(filePath: string, fileHash: string): Promise<{ width: number; height: number }> {
    const thumbPath = this.getThumbnailPath(fileHash, 'thumb');
    const previewPath = this.getThumbnailPath(fileHash, 'preview');

    const image = sharp(filePath, { failOnError: false }).rotate(); // auto-rotate based on EXIF
    const metadata = await image.metadata();

    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    if (!fs.existsSync(thumbPath)) {
      await SIZES.thumb.encode(image.clone()).toFile(thumbPath);
    }

    if (!fs.existsSync(previewPath)) {
      await SIZES.preview.encode(image.clone()).toFile(previewPath);
    }

    return { width: origWidth, height: origHeight };
  }

  /**
   * Returns the cached thumbnail or preview of a photo as it looks with its edits, rendering it on first
   * use. Without effective edits this is the scanner's image (generated if missing).
   */
  public static async getImage(
    photo: { filePath: string; fileHash: string },
    edits: readonly EditStep[] | null | undefined,
    size: ImageSize,
    lookup: FilterLookup,
  ): Promise<string> {
    const key = renderKey(edits, lookup);
    if (!key) {
      const plain = this.getThumbnailPath(photo.fileHash, size);
      if (!fs.existsSync(plain)) await this.generateThumbnails(photo.filePath, photo.fileHash);
      return plain;
    }

    const target = this.getRenderedPath(photo.fileHash, key, size);
    if (fs.existsSync(target)) return target;
    const running = this.inFlight.get(target);
    if (running) return running;

    const render = (async () => {
      const image = await RenderService.render(photo.filePath, edits ?? [], {
        lookup,
        workingSize: RenderService.workingSizeFor(SIZES[size].box),
        stepTimeoutMs: PREVIEW_STEP_TIMEOUT_MS,
        label: photo.filePath,
      });
      const tmp = `${target}.${process.pid}.tmp`;
      await SIZES[size].encode(image).toFile(tmp);
      fs.renameSync(tmp, target);
      return target;
    })().finally(() => this.inFlight.delete(target));
    this.inFlight.set(target, render);
    return render;
  }
}
