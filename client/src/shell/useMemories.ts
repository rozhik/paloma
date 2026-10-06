import { useEffect, useState } from 'react';
import type { Memory } from '../../../shared/types.js';
import { fetchMemories, localDate } from '../api/memories.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** How often memories are re-read; each read takes the local date anew, so a new day shows up by itself */
const REFRESH_MS = 5000;

/** Today's memories, newest first, kept fresh and re-read when the window gets focus; empty while not `enabled`. */
export function useMemories(enabled: boolean): Memory[] {
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const [memories, setMemories] = useState<Memory[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMemories([]);
      return;
    }
    const load = () => fetchMemories(localDate()).then(setMemories).catch((err) => console.error('Failed to fetch memories:', err));
    load();
    const interval = setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', load);
    };
  }, [enabled, libraryVersion]);

  return memories;
}
