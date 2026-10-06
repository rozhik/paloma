import { create } from 'zustand';
import type { DetectedFaceInput, Photo } from '../../../shared/types.js';
import { faceSourceUrl, fetchPendingDetection, saveDetectedFaces } from '../api/people.js';
import { DETECTOR, detectFaces, loadFaceApi, loadImage } from './detector.js';

/** What a detection run needs from the browser and the server; replaced in tests. */
export interface DetectionDeps {
  /** The photos among `ids` that still need detection */
  pending: (ids: number[]) => Promise<number[]>;
  /** Loads the detector; a failure ends the run before any photo */
  prepare: () => Promise<void>;
  detect: (photo: Photo) => Promise<DetectedFaceInput[]>;
  save: (photo: Photo, faces: DetectedFaceInput[]) => Promise<void>;
}

export const browserDeps: DetectionDeps = {
  pending: async (ids) => (await fetchPendingDetection(ids, DETECTOR)).pending,
  prepare: async () => { await loadFaceApi(); },
  detect: async (photo) => detectFaces(await loadImage(faceSourceUrl(photo.id))),
  save: async (photo, faces) => { await saveDetectedFaces(photo.id, DETECTOR, photo.fileHash, faces); },
};

export interface DetectionProgress {
  /** Photos to detect in this run */
  total: number;
  done: number;
  cancelling: boolean;
}

export interface DetectionResult {
  faces: number;
  /** Photos with at least one face */
  photos: number;
  /** Photos that could not be detected or saved */
  failed: number;
  /** Photos the run had to detect; 0 when every photo was already done */
  total: number;
  cancelled: boolean;
  /** The detector could not be loaded */
  error: unknown;
}

interface DetectionStore {
  /** The run in progress; null when there is none */
  progress: DetectionProgress | null;
  /** How the last run ended, until the message is closed */
  result: DetectionResult | null;
  /** Bumped when a run ends, so views showing detected faces reload */
  finished: number;
  /** Detects the faces on the photos that still need it, one photo at a time; does nothing while a run exists */
  start: (photos: readonly Photo[], deps?: DetectionDeps) => Promise<void>;
  /** Stops the run after the photo being detected */
  cancel: () => void;
  dismissResult: () => void;
}

export const useFaceDetection = create<DetectionStore>((set, get) => ({
  progress: null,
  result: null,
  finished: 0,

  start: async (photos, deps = browserDeps) => {
    if (get().progress) return;
    set({ progress: { total: 0, done: 0, cancelling: false }, result: null });
    const result: DetectionResult = { faces: 0, photos: 0, failed: 0, total: 0, cancelled: false, error: null };
    try {
      const byId = new Map(photos.map((photo) => [photo.id, photo]));
      const pending = photos.length > 0 ? (await deps.pending([...byId.keys()])).filter((id) => byId.has(id)) : [];
      result.total = pending.length;
      set({ progress: { total: pending.length, done: 0, cancelling: get().progress?.cancelling ?? false } });
      if (pending.length > 0) await deps.prepare();
      for (const id of pending) {
        if (get().progress?.cancelling) {
          result.cancelled = true;
          break;
        }
        try {
          const photo = byId.get(id)!;
          const faces = await deps.detect(photo);
          await deps.save(photo, faces);
          result.faces += faces.length;
          if (faces.length > 0) result.photos += 1;
        } catch (err) {
          console.error(`Face detection failed for photo ${id}:`, err);
          result.failed += 1;
        }
        const progress = get().progress!;
        set({ progress: { ...progress, done: progress.done + 1 } });
      }
    } catch (err) {
      console.error('Face detection could not run:', err);
      result.error = err;
    }
    set({ progress: null, result, finished: get().finished + 1 });
  },

  cancel: () => {
    const { progress } = get();
    if (progress) set({ progress: { ...progress, cancelling: true } });
  },

  dismissResult: () => set({ result: null }),
}));

/** The share of a run that is done, 0 to 1. */
export const progressShare = (progress: Pick<DetectionProgress, 'done' | 'total'>): number =>
  progress.total > 0 ? Math.min(progress.done / progress.total, 1) : 0;
