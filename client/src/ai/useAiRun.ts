import { useEffect } from 'react';
import { create } from 'zustand';
import type { AiRunInfo, AiRunStatus, Photo } from '../../../shared/types.js';
import { cancelAiRun, fetchAiRunStatus, startAiRun } from '../api/ai.js';
import { currentLanguage } from '../i18n/index.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** Polling interval while a run exists, and otherwise (another user or browser may start one). */
export const POLL_RUNNING_MS = 1000;
export const POLL_IDLE_MS = 10000;

/** What the store needs from the server; replaced in tests. */
export interface AiRunDeps {
  status: () => Promise<AiRunStatus>;
  start: (taskId: string, photoIds: number[], again: boolean) => Promise<AiRunInfo>;
  cancel: () => Promise<AiRunStatus>;
  /** Called when a run this browser watched ends, so views showing its photos reload */
  ended: (run: AiRunInfo) => void;
}

export const serverDeps: AiRunDeps = {
  status: fetchAiRunStatus,
  start: (taskId, photoIds, again) => startAiRun({ taskId, photoIds, again }, currentLanguage()),
  cancel: cancelAiRun,
  ended: () => usePalomaStore.getState().bumpLibrary(),
};

interface AiRunStore {
  /** The run on the server, as last polled; null when there is none */
  current: AiRunInfo | null;
  /** How the run this browser watched ended, until the message is closed */
  result: AiRunInfo | null;
  /** Bumped when a watched run ends, so views showing AI results reload */
  finished: number;
  /** Why the last start or stop from this browser failed, until closed */
  error: unknown;
  /** Asks the server for the run; shows its end when this browser saw it running */
  refresh: (deps?: AiRunDeps) => Promise<void>;
  /** Starts a task on photos; throws the server's refusal (another run, task not ready) */
  start: (taskId: string, photos: readonly Pick<Photo, 'id'>[], again?: boolean, deps?: AiRunDeps) => Promise<void>;
  cancel: (deps?: AiRunDeps) => Promise<void>;
  dismissResult: () => void;
  dismissError: () => void;
  /** Starts a task on photos that may still have to be fetched; a refusal is kept in `error` */
  run: (taskId: string, photos: readonly Pick<Photo, 'id'>[] | (() => Promise<readonly Pick<Photo, 'id'>[]>), again?: boolean) => Promise<void>;
}

export const useAiRun = create<AiRunStore>((set, get) => ({
  current: null,
  result: null,
  finished: 0,
  error: null,

  refresh: async (deps = serverDeps) => {
    const status = await deps.status();
    const watched = get().current;
    if (watched && !status.current) {
      // The run ended between two polls: its summary is the last run, when it is the same one
      const ended = status.last?.id === watched.id ? status.last : null;
      set({ current: null, result: ended, finished: get().finished + 1 });
      if (ended) deps.ended(ended);
      return;
    }
    set({ current: status.current });
  },

  start: async (taskId, photos, again = false, deps = serverDeps) => {
    const run = await deps.start(taskId, photos.map((photo) => photo.id), again);
    set({ current: run, result: null });
  },

  cancel: async (deps = serverDeps) => {
    const status = await deps.cancel();
    if (status.current) set({ current: status.current });
  },

  dismissResult: () => set({ result: null }),
  dismissError: () => set({ error: null }),

  run: async (taskId, photos, again = false) => {
    set({ error: null });
    try {
      const list = typeof photos === 'function' ? await photos() : photos;
      if (list.length > 0) await get().start(taskId, list, again);
    } catch (err) {
      set({ error: err });
    }
  },
}));

/** Polls the server's run while mounted: often while one runs, rarely otherwise. */
export function useAiRunPolling(enabled: boolean): void {
  const running = useAiRun((state) => state.current !== null);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const poll = () => { useAiRun.getState().refresh().catch(() => {}); };
    poll();
    const timer = setInterval(() => { if (!stopped) poll(); }, running ? POLL_RUNNING_MS : POLL_IDLE_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled, running]);
}
