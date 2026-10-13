import { create } from 'zustand';
import type { FaceDetectResponse, Photo } from '../../../shared/types.js';
import { startFaceDetection } from '../api/tasks.js';
import { onTaskEnded, refreshTasks } from '../tasks/useTasks.js';

/** What the store needs from the server; replaced in tests. */
export interface DetectionDeps {
  start: (photoIds: number[]) => Promise<FaceDetectResponse>;
  added: () => Promise<void>;
}

export const serverDeps: DetectionDeps = { start: startFaceDetection, added: refreshTasks };

interface DetectionStore {
  /** Bumped when a detection task ends, so views showing detected faces reload */
  finished: number;
  /** Every photo asked for was already detected, until the message is closed */
  nothingToDo: boolean;
  /** Why the last start from this browser failed, until closed */
  error: unknown;
  /** Adds a face detection task on the server for the photos that still need it */
  start: (photos: readonly Pick<Photo, 'id'>[], deps?: DetectionDeps) => Promise<void>;
  dismiss: () => void;
}

export const useFaceDetection = create<DetectionStore>((set) => ({
  finished: 0,
  nothingToDo: false,
  error: null,

  start: async (photos, deps = serverDeps) => {
    set({ error: null, nothingToDo: false });
    if (photos.length === 0) return;
    try {
      const { task } = await deps.start(photos.map((photo) => photo.id));
      if (task) await deps.added();
      else set({ nothingToDo: true });
    } catch (err) {
      set({ error: err });
    }
  },

  dismiss: () => set({ error: null, nothingToDo: false }),
}));

onTaskEnded((task) => {
  if (task.kind === 'faces') useFaceDetection.setState((state) => ({ finished: state.finished + 1 }));
});
