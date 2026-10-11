import { useEffect } from 'react';
import { create } from 'zustand';
import type { AiTask } from '../../../shared/types.js';
import { fetchAiTasks } from '../api/ai.js';

interface AiTasksStore {
  /** The tasks, as last fetched; null before the first fetch */
  tasks: AiTask[] | null;
  loading: Promise<void> | null;
  /** Fetches the tasks once; `force` fetches again (a menu opening, a task changed in Server settings) */
  load: (force?: boolean) => Promise<void>;
}

export const useAiTasks = create<AiTasksStore>((set, get) => ({
  tasks: null,
  loading: null,

  load: (force = false) => {
    const { tasks, loading } = get();
    if (loading) return loading;
    if (tasks && !force) return Promise.resolve();
    const next = fetchAiTasks()
      .then((list) => set({ tasks: list }))
      .catch((err) => console.error('Failed to fetch AI tasks:', err))
      .finally(() => set({ loading: null }));
    set({ loading: next });
    return next;
  },
}));

/** The tasks offered in AI menus, fetched on first use when `enabled`. */
export function useMenuTasks(enabled: boolean): AiTask[] {
  const tasks = useAiTasks((state) => state.tasks);
  useEffect(() => {
    if (enabled) void useAiTasks.getState().load();
  }, [enabled]);
  return enabled ? (tasks ?? []).filter((task) => task.inMenu) : [];
}
