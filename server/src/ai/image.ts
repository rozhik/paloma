import sharp from 'sharp';
import type { AiRequest } from '../plugins/api.js';

/**
 * The image a provider gets: the photo file upright (EXIF orientation applied), without edits, with its long
 * edge at most `size` pixels, as JPEG. Rectangles in the answer are therefore in the same space as detected faces.
 */
export async function prepareImage(filePath: string, size: number): Promise<AiRequest['image']> {
  const { data, info } = await sharp(filePath, { failOnError: false })
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { data, mimeType: 'image/jpeg', width: info.width, height: info.height };
}
