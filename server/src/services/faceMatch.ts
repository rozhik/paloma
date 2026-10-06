import type { RelativeRect } from '../../../shared/types.js';

/** Detected faces that cover a mark at least this much belong to the mark's person. */
export const MATCH_IOU = 0.5;
/** Faces at most this far from one of a person's faces are similar to them. */
export const SIMILAR_DISTANCE = 0.55;
export const DESCRIPTOR_LENGTH = 128;

/** Intersection over union of two rectangles; 0 when they do not overlap or are empty. */
export function iou(a: RelativeRect, b: RelativeRect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  const intersection = width * height;
  const area = (r: RelativeRect) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  const union = area(a) + area(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

export interface MarkRect {
  contactId: string;
  rect: RelativeRect;
}

/**
 * The person each detected face of a photo belongs to: the person of the mark it overlaps most, if that
 * overlap reaches MATCH_IOU; faces without such a mark are absent from the result.
 */
export function assignDetected<T extends { id: number; rect: RelativeRect }>(faces: readonly T[], marks: readonly MarkRect[]): Map<number, string> {
  const owners = new Map<number, string>();
  for (const face of faces) {
    let best = 0;
    let owner: string | undefined;
    for (const mark of marks) {
      const overlap = iou(face.rect, mark.rect);
      if (overlap >= MATCH_IOU && overlap > best) {
        best = overlap;
        owner = mark.contactId;
      }
    }
    if (owner !== undefined) owners.set(face.id, owner);
  }
  return owners;
}

export function euclidean(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** The smallest distance from `descriptor` to any of `references`; Infinity without references. */
export function nearest(descriptor: Float32Array, references: readonly Float32Array[]): number {
  let best = Infinity;
  for (const reference of references) best = Math.min(best, euclidean(descriptor, reference));
  return best;
}

/** A descriptor as stored: little-endian float32. */
export function encodeDescriptor(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => buffer.writeFloatLE(value, i * 4));
  return buffer;
}

export function decodeDescriptor(buffer: Buffer): Float32Array {
  const values = new Float32Array(buffer.length / 4);
  for (let i = 0; i < values.length; i++) values[i] = buffer.readFloatLE(i * 4);
  return values;
}
