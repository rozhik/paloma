import { useEffect } from 'react';
import { create } from 'zustand';
import type { TaskInfo, TaskState } from '../../../shared/types.js';
import { cancelTask, fetchTasks, moveTask, pauseTask, resumeTask } from '../api/tasks.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** Polling interval while the Tasks view is open or one of the user's tasks has not ended, and otherwise. */
export const POLL_ACTIVE_MS = 2000;
export const POLL_IDLE_MS = 15000;

const ENDED: readonly TaskState[] = ['finished', 'cancelled', 'failed'];
export const isEnded = (task: Pick<TaskInfo, 'state'>): boolean => ENDED.includes(task.state);

/** Running, pausing, waiting, paused or cancelling: the task is in the queue. */
export const isActive = (task: Pick<TaskInfo, 'state'>): boolean => !isEnded(task);

/** How often to ask the server for the queue. */
export function pollInterval(tasks: readonly TaskInfo[], viewOpen: boolean): number {
  return viewOpen || tasks.some((task) => isActive(task) && (task.mine || task.kind === 'scan')) ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

/** Called when a task this browser saw in the queue has ended; set by the stores of each kind. */
type EndListener = (task: TaskInfo) => void;
const endListeners = new Set<EndListener>();

/** Tells `listener` about every task that ends while this browser watches the queue; returns how to stop. */
export function onTaskEnded(listener: EndListener): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

/** What the store needs from the server; replaced in tests. */
export interface TaskDeps {
  list: () => Promise<{ tasks: TaskInfo[] }>;
  pause: (id: string) => Promise<unknown>;
  resume: (id: string) => Promise<unknown>;
  cancel: (id: string) => Promise<unknown>;
  move: (id: string, before: string | null) => Promise<unknown>;
}

export const serverDeps: TaskDeps = { list: fetchTasks, pause: pauseTask, resume: resumeTask, cancel: cancelTask, move: moveTask };

interface TasksStore {
  tasks: TaskInfo[];
  /** The Tasks view is open somewhere in this browser (counted, as skins may mount it twice) */
  viewers: number;
  /** The user's tasks that ended while this browser watched, until their message is closed */
  ended: TaskInfo[];
  /** Why the last action from this browser failed, until closed */
  error: unknown;
  refresh: (deps?: TaskDeps) => Promise<void>;
  /** Pauses, resumes, cancels (or removes once ended) or moves a task, then reloads the queue */
  act: (action: 'pause' | 'resume' | 'cancel', id: string, deps?: TaskDeps) => Promise<void>;
  move: (id: string, before: string | null, deps?: TaskDeps) => Promise<void>;
  dismissEnded: (id: string) => void;
  dismissError: () => void;
  setError: (error: unknown) => void;
}

export const useTasks = create<TasksStore>((set, get) => ({
  tasks: [],
  viewers: 0,
  ended: [],
  error: null,

  refresh: async (deps = serverDeps) => {
    const { tasks } = await deps.list();
    const before = new Map(get().tasks.map((task) => [task.id, task]));
    const justEnded = tasks.filter((task) => isEnded(task) && before.has(task.id) && isActive(before.get(task.id)!));
    set({
      tasks,
      // Messages are for the user's own tasks; other tasks only make views reload
      ended: [...get().ended, ...justEnded.filter((task) => task.mine)],
    });
    for (const task of justEnded) for (const listener of endListeners) listener(task);
  },

  act: async (action, id, deps = serverDeps) => {
    try {
      await deps[action](id);
    } catch (err) {
      set({ error: err });
    }
    await get().refresh(deps).catch(() => {});
  },

  move: async (id, before, deps = serverDeps) => {
    try {
      await deps.move(id, before);
    } catch (err) {
      set({ error: err });
    }
    await get().refresh(deps).catch(() => {});
  },

  dismissEnded: (id) => set({ ended: get().ended.filter((task) => task.id !== id) }),
  dismissError: () => set({ error: null }),
  setError: (error) => set({ error }),
}));

/** Reloads the queue now, e.g. right after this browser added a task. */
export const refreshTasks = (): Promise<void> => useTasks.getState().refresh().catch(() => {});

/** Polls the queue while mounted: often while the user's tasks or scans are in it or the Tasks view is open. */
export function useTaskPolling(enabled: boolean): void {
  const interval = useTasks((state) => pollInterval(state.tasks, state.viewers > 0));
  useEffect(() => {
    if (!enabled) return;
    const poll = () => { useTasks.getState().refresh().catch(() => {}); };
    poll();
    const timer = setInterval(poll, interval);
    return () => clearInterval(timer);
  }, [enabled, interval]);
}

/** Marks the Tasks view as open while mounted, so the queue is polled often. */
export function useTasksViewOpen(): void {
  useEffect(() => {
    useTasks.setState((state) => ({ viewers: state.viewers + 1 }));
    return () => useTasks.setState((state) => ({ viewers: state.viewers - 1 }));
  }, []);
}

/**
 * Where a user may drop a task: before another task they may move, or at the end. An owner without users.manage
 * reorders only among their own tasks, so the slots are their own waiting and paused tasks.
 */
export function canDropBefore(dragged: TaskInfo, target: TaskInfo | null, tasks: readonly TaskInfo[], controlsAll: boolean): boolean {
  if (target?.id === dragged.id) return false;
  if (target && target.state !== 'waiting' && target.state !== 'paused') return false;
  if (controlsAll) return true;
  if (target === null) return tasks.some((task) => task.id !== dragged.id && task.mine && (task.state === 'waiting' || task.state === 'paused'));
  return target.mine;
}

// A scan changed what the library holds: views showing photos reload
onTaskEnded((task) => {
  if (task.kind === 'scan') usePalomaStore.getState().bumpLibrary();
});
