import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DetectedFaceInput, Photo } from '../../../shared/types.js';
import { progressShare, useFaceDetection, type DetectionDeps } from './detectionRunner.js';
import { toFaceInput } from './detector.js';

const photos = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, fileHash: `h${i + 1}` }) as Photo);
const face = (): DetectedFaceInput => ({ rect: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 }, score: 0.9, descriptor: [] });

/** Deps where photo 2 has two faces, photo 4 one, and the server says photos 1 and 3 are done. */
function fakeDeps(overrides: Partial<DetectionDeps> = {}): DetectionDeps & { saved: number[] } {
  const saved: number[] = [];
  return {
    saved,
    pending: async (ids) => ids.filter((id) => id !== 1 && id !== 3),
    prepare: async () => {},
    detect: async (photo) => (photo.id === 2 ? [face(), face()] : photo.id === 4 ? [face()] : []),
    save: async (photo) => { saved.push(photo.id); },
    ...overrides,
  };
}

const state = () => useFaceDetection.getState();

beforeEach(() => {
  useFaceDetection.setState({ progress: null, result: null, finished: 0 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('face detection runner', () => {
  it('detects only the pending photos and counts the faces found', async () => {
    const deps = fakeDeps();
    await state().start(photos, deps);

    expect(deps.saved).toEqual([2, 4, 5]);
    expect(state().progress).toBeNull();
    expect(state().result).toMatchObject({ faces: 3, photos: 2, failed: 0, total: 3, cancelled: false });
    expect(state().finished).toBe(1);
  });

  it('reports progress after each photo', async () => {
    const seen: string[] = [];
    const deps = fakeDeps({
      save: async () => {
        const { done, total } = state().progress!;
        seen.push(`${done}/${total}`);
      },
    });
    await state().start(photos, deps);
    expect(seen).toEqual(['0/3', '1/3', '2/3']);
  });

  it('stops after the current photo when cancelled, and a new run detects the rest', async () => {
    const deps = fakeDeps({
      pending: async (ids) => ids.filter((id) => !deps.saved.includes(id)),
      save: async (photo) => {
        deps.saved.push(photo.id);
        if (deps.saved.length === 2) state().cancel();
      },
    });
    await state().start(photos, deps);
    expect(deps.saved).toEqual([1, 2]);
    expect(state().result).toMatchObject({ cancelled: true, total: 5 });

    await state().start(photos, deps);
    expect(deps.saved).toEqual([1, 2, 3, 4, 5]);
    expect(state().result).toMatchObject({ cancelled: false, total: 3 });
  });

  it('goes on after a photo fails and counts it', async () => {
    const deps = fakeDeps({ detect: async (photo) => { if (photo.id === 4) throw new Error('bad image'); return []; } });
    await state().start(photos, deps);
    expect(deps.saved).toEqual([2, 5]);
    expect(state().result).toMatchObject({ failed: 1, faces: 0 });
  });

  it('ends with the error when the detector cannot be loaded', async () => {
    const error = new Error('no WebGL');
    await state().start(photos, fakeDeps({ prepare: async () => { throw error; } }));
    expect(state().result).toMatchObject({ error, total: 3 });
  });

  it('does not load the detector when every photo is done', async () => {
    const prepare = vi.fn(async () => {});
    await state().start(photos, fakeDeps({ pending: async () => [], prepare }));
    expect(prepare).not.toHaveBeenCalled();
    expect(state().result).toMatchObject({ total: 0 });
  });

  it('ignores a second start while running', async () => {
    let release!: () => void;
    const deps = fakeDeps({ prepare: () => new Promise<void>((resolve) => { release = resolve; }) });
    const first = state().start(photos, deps);
    await Promise.resolve();
    const second = state().start(photos, fakeDeps());
    await second;
    release();
    await first;
    expect(deps.saved).toEqual([2, 4, 5]);
    expect(state().finished).toBe(1);
  });

  it('computes the share done', () => {
    expect(progressShare({ done: 12, total: 30 })).toBeCloseTo(0.4);
    expect(progressShare({ done: 0, total: 0 })).toBe(0);
  });
});

describe('toFaceInput', () => {
  it('turns a pixel box into fractions of the image, clipped to it', () => {
    expect(toFaceInput({ x: -10, y: 50, width: 110, height: 100 }, 0.97, new Float32Array([0.5, -0.25]), { width: 1000, height: 500 }))
      .toEqual({ rect: { left: 0, top: 0.1, right: 0.1, bottom: 0.3 }, score: 0.97, descriptor: [0.5, -0.25] });
  });
});
