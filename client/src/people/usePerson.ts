import { useEffect, useState } from 'react';
import type { Person } from '../../../shared/types.js';
import { ApiRequestError } from '../api/http.js';
import { fetchPerson } from '../api/people.js';
import { usePalomaStore } from '../store/usePalomaStore.js';

/** The chosen person with the whole profile, refreshed after library changes; a deleted person goes back to all photos. */
export function usePerson(personId: string | null): { person: Person | null; setPerson: (person: Person) => void } {
  const libraryVersion = usePalomaStore((state) => state.libraryVersion);
  const setSelectedFilter = usePalomaStore((state) => state.setSelectedFilter);
  const [person, setPerson] = useState<Person | null>(null);

  useEffect(() => {
    if (personId === null) {
      setPerson(null);
      return;
    }
    let cancelled = false;
    fetchPerson(personId)
      .then((found) => { if (!cancelled) setPerson(found); })
      .catch((err) => {
        if (!cancelled && err instanceof ApiRequestError && err.status === 404) setSelectedFilter('all');
      });
    return () => { cancelled = true; };
  }, [personId, libraryVersion]);

  return { person: person?.id === personId ? person : null, setPerson };
}
