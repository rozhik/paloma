import { describe, it, expect } from 'vitest';
import { assignDetected, decodeDescriptor, encodeDescriptor, euclidean, iou, nearest } from './faceMatch.js';

const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const ROY = 'b8e4117cf1d6615b';
const ANN = '0123456789abcdef';

describe('iou', () => {
  it('is 1 for the same rectangle and 0 without overlap', () => {
    expect(iou(rect(0.1, 0.1, 0.3, 0.3), rect(0.1, 0.1, 0.3, 0.3))).toBe(1);
    expect(iou(rect(0, 0, 0.1, 0.1), rect(0.2, 0.2, 0.3, 0.3))).toBe(0);
  });

  it('is intersection over union for a partial overlap', () => {
    // two 0.2 × 0.2 squares shifted by 0.1: intersection 0.02, union 0.06
    expect(iou(rect(0, 0, 0.2, 0.2), rect(0.1, 0, 0.3, 0.2))).toBeCloseTo(1 / 3);
  });
});

describe('assignDetected', () => {
  it('assigns a face that overlaps a mark enough', () => {
    const owners = assignDetected([{ id: 1, rect: rect(0.1, 0.1, 0.3, 0.3) }], [{ contactId: ROY, rect: rect(0.11, 0.1, 0.31, 0.3) }]);
    expect(owners).toEqual(new Map([[1, ROY]]));
  });

  it('leaves a face that overlaps no mark enough unassigned', () => {
    const owners = assignDetected([{ id: 1, rect: rect(0, 0, 0.2, 0.2) }], [{ contactId: ROY, rect: rect(0.1, 0, 0.3, 0.2) }]);
    expect(owners.size).toBe(0);
  });

  it('picks the mark with the largest overlap', () => {
    const owners = assignDetected(
      [{ id: 1, rect: rect(0.1, 0.1, 0.3, 0.3) }],
      [{ contactId: ROY, rect: rect(0.13, 0.1, 0.33, 0.3) }, { contactId: ANN, rect: rect(0.1, 0.1, 0.3, 0.31) }],
    );
    expect(owners.get(1)).toBe(ANN);
  });
});

describe('descriptors', () => {
  it('round-trips through float32 storage', () => {
    const values = Array.from({ length: 128 }, (_, i) => i / 128 - 0.5);
    expect(Array.from(decodeDescriptor(encodeDescriptor(values)))).toEqual(values.map(Math.fround));
  });

  it('measures the distance to the nearest reference', () => {
    const a = new Float32Array([0, 0]);
    expect(euclidean(a, new Float32Array([3, 4]))).toBe(5);
    expect(nearest(a, [new Float32Array([3, 4]), new Float32Array([0, 1])])).toBe(1);
    expect(nearest(a, [])).toBe(Infinity);
  });
});
