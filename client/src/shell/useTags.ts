import { useEffect, useState } from 'react';
import type { TagSummary } from '../../../shared/types.js';
import { fetchTags } from '../api/tags.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** How often the tag list is re-read, so tags found by the scanner show up */
const REFRESH_MS = 5000;

/** The library's tags with their photo counts, kept fresh; the same for every skin. */
export function useTags(): TagSummary[] {
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const [tags, setTags] = useState<TagSummary[]>([]);

  useEffect(() => {
    const load = () => fetchTags().then(setTags).catch((err) => console.error('Failed to fetch tags:', err));
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [libraryVersion]);

  return tags;
}
