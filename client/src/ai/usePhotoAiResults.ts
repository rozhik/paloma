import { useEffect, useState } from 'react';
import type { PhotoAiResult } from '../../../shared/types.js';
import { fetchPhotoAiResults } from '../api/ai.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { useAiRun } from './useAiRun.js';

/** The photo's AI results; fetched again when a run ends or the library changes. Null while loading. */
export function usePhotoAiResults(photoId: number): { results: PhotoAiResult[] | null; reload: () => void } {
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const finished = useAiRun((state) => state.finished);
  const [results, setResults] = useState<PhotoAiResult[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchPhotoAiResults(photoId)
      .then((found) => { if (!cancelled) setResults(found); })
      .catch((err) => console.error('Failed to fetch the AI results of the photo:', err));
    return () => { cancelled = true; };
  }, [photoId, libraryVersion, finished, version]);
  return { results, reload: () => setVersion((v) => v + 1) };
}
