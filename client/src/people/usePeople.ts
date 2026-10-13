import { useEffect, useState } from 'react';
import type { PersonSummary } from '../../../shared/types.js';
import { fetchPeople, fetchUnassignedFaces } from '../api/people.js';
import { useFaceDetection } from '../faces/useFaceDetection.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** How often the people list is re-read, so people found by the scanner show up */
const REFRESH_MS = 5000;

/**
 * People in the order the People view and the sidebar show them: known people by name in the language, then
 * unknown people, those on the most photos first.
 */
export function sortPeople(people: readonly PersonSummary[], language: string): PersonSummary[] {
  const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });
  return [...people].sort((a, b) => {
    if (a.name !== null && b.name !== null) return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
    if (a.name !== null) return -1;
    if (b.name !== null) return 1;
    return b.photoCount - a.photoCount || a.id.localeCompare(b.id);
  });
}

/** Every person of the library, kept fresh; unsorted. */
export function usePeople(): { people: PersonSummary[]; reload: () => void } {
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = () => fetchPeople().then(setPeople).catch((err) => console.error('Failed to fetch people:', err));
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [libraryVersion, tick]);

  return { people, reload: () => setTick((n) => n + 1) };
}

/** How many detected faces belong to no person, kept fresh; 0 while `enabled` is false. */
export function useUnrecognizedCount(enabled: boolean): number {
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const finished = useFaceDetection((state) => state.finished);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    const load = () => fetchUnassignedFaces(0).then((result) => setCount(result.total)).catch(() => {});
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [enabled, libraryVersion, finished]);

  return count;
}
