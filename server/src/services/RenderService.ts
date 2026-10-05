import sharp from 'sharp';
import type { EditStep } from '../../../shared/types.js';
import { checkStepParams, type FilterLookup } from './editChain.js';

export interface RenderOptions {
  lookup: FilterLookup;
  /** Downscale to fit this box before the chain runs (previews and thumbnails); full size when absent */
  workingSize?: number;
  /** Time one step may take before it counts as failed */
  stepTimeoutMs?: number;
  /** Names the photo in logs */
  label?: string;
}

interface Pixels {
  data: Buffer;
  info: { width: number; height: number; channels: 1 | 2 | 3 | 4 };
}

/** A rendered photo and the size the same chain gives at full resolution. */
export interface RenderResult {
  image: sharp.Sharp;
  width: number;
  height: number;
  /** Size of the result when rendered from the full-size photo; filters are resolution-independent */
  fullWidth: number;
  fullHeight: number;
}

export const PREVIEW_STEP_TIMEOUT_MS = 10_000;
export const FULL_STEP_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function materialize(image: sharp.Sharp): Promise<Pixels> {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, info: { width: info.width, height: info.height, channels: info.channels } };
}

const fromPixels = (pixels: Pixels) => sharp(pixels.data, { raw: pixels.info });

function isSharp(value: unknown): value is sharp.Sharp {
  return typeof value === 'object' && value !== null && typeof (value as sharp.Sharp).toBuffer === 'function'
    && typeof (value as sharp.Sharp).raw === 'function';
}

export class RenderService {
  /**
   * Renders a photo through its edit chain: EXIF orientation first, then each step from first to last.
   * Steps marked `enabled: false`, steps of filters no active plugin provides, steps with invalid
   * parameters and steps that fail or time out are skipped; failures are logged with the photo and filter.
   * Returns the result as a sharp image, ready for resizing and encoding.
   */
  public static async render(filePath: string, steps: readonly EditStep[], options: RenderOptions): Promise<sharp.Sharp> {
    return (await RenderService.renderWithSize(filePath, steps, options)).image;
  }

  /** As `render`, and also tells the size the chain gives at full resolution when it ran on a smaller copy. */
  public static async renderWithSize(filePath: string, steps: readonly EditStep[], options: RenderOptions): Promise<RenderResult> {
    const label = options.label ?? filePath;
    const timeoutMs = options.stepTimeoutMs ?? FULL_STEP_TIMEOUT_MS;

    let image = sharp(filePath, { failOnError: false }).rotate();
    if (options.workingSize) {
      image = image.resize({ width: options.workingSize, height: options.workingSize, fit: 'inside', withoutEnlargement: true });
    }
    let pixels = await materialize(image);
    // How much larger the full-size photo is than the copy the chain runs on (1 without downscaling)
    let scale = 1;
    if (options.workingSize) {
      // The long side does not depend on EXIF orientation, so the stored size is enough
      const meta = await sharp(filePath, { failOnError: false }).metadata();
      const sourceLong = Math.max(meta.width ?? 0, meta.height ?? 0);
      const workingLong = Math.max(pixels.info.width, pixels.info.height);
      if (sourceLong > 0 && workingLong > 0) scale = sourceLong / workingLong;
    }

    for (const step of steps) {
      if (step.enabled === false) continue;
      const filter = options.lookup(step.filter);
      if (!filter) continue;
      const check = checkStepParams(step, filter);
      if (!check.ok) {
        console.error(`Skipping filter ${step.filter} on ${label}: "${check.param}" ${check.reason}`);
        continue;
      }
      try {
        const output = await withTimeout(Promise.resolve().then(() => filter.definition.render({
          image: fromPixels(pixels),
          width: pixels.info.width,
          height: pixels.info.height,
          params: check.params,
          host: filter.host,
        })), timeoutMs, `filter ${step.filter}`);
        if (!isSharp(output)) throw new Error('render() did not return a sharp image');
        pixels = await withTimeout(materialize(output), timeoutMs, `filter ${step.filter}`);
      } catch (err) {
        console.error(`Filter ${step.filter} (plugin ${filter.pluginId}) failed on ${label}, skipping it: ${(err as Error).message}`);
      }
    }
    const { width, height } = pixels.info;
    return {
      image: fromPixels(pixels),
      width,
      height,
      fullWidth: Math.max(1, Math.round(width * scale)),
      fullHeight: Math.max(1, Math.round(height * scale)),
    };
  }

  /** Box to render a chain in for an image that will be shown within `size`×`size`. */
  public static workingSizeFor(size: number): number {
    return Math.max(400, Math.ceil(size * 1.5));
  }
}
