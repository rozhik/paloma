import { create } from 'zustand';
import type { Photo, TaskInfo } from '../../../shared/types.js';
import { startAiRun } from '../api/ai.js';
import { currentLanguage } from '../i18n/index.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { onTaskEnded, refreshTasks } from '../tasks/useTasks.js';

/** What the store needs from the server; replaced in tests. */
export interface AiRunDeps {
  start: (taskId: string, photoIds: number[], again: boolean) => Promise<TaskInfo>;
  /** Called once the run is in the queue, so the queue is shown at once */
  added: () => Promise<void>;
}

export const serverDeps: AiRunDeps = {
  start: (taskId, photoIds, again) => startAiRun({ taskId, photoIds, again }, currentLanguage()),
  added: refreshTasks,
};

interface AiRunStore {
  /** Bumped when an AI run ends, so views showing AI results reload */
  finished: number;
  /** Why the last start from this browser failed, until closed */
  error: unknown;
  /** Adds a run of a task on photos that may still have to be fetched to the queue; a refusal is kept in `error` */
  run: (taskId: string, photos: readonly Pick<Photo, 'id'>[] | (() => Promise<readonly Pick<Photo, 'id'>[]>), again?: boolean, deps?: AiRunDeps) => Promise<void>;
  dismissError: () => void;
}

export const useAiRun = create<AiRunStore>((set) => ({
  finished: 0,
  error: null,

  run: async (taskId, photos, again = false, deps = serverDeps) => {
    set({ error: null });
    try {
      const list = typeof photos === 'function' ? await photos() : photos;
      if (list.length === 0) return;
      await deps.start(taskId, list.map((photo) => photo.id), again);
      await deps.added();
    } catch (err) {
      set({ error: err });
    }
  },

  dismissError: () => set({ error: null }),
}));

// An ended run changed tags and descriptions: views showing them reload
onTaskEnded((task) => {
  if (task.kind !== 'ai') return;
  useAiRun.setState((state) => ({ finished: state.finished + 1 }));
  usePalomaStore.getState().bumpLibrary();
});
