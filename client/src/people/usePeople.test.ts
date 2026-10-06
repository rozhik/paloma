import { describe, it, expect } from 'vitest';
import type { PersonSummary } from '../../../shared/types.js';
import { sortPeople } from './usePeople.js';

const person = (id: string, name: string | null, photoCount: number): PersonSummary =>
  ({ id, name, alias: null, avatarVersion: null, photoCount });

describe('sortPeople', () => {
  it('puts known people by name first, then unknown people with the most photos first', () => {
    const sorted = sortPeople([
      person('1', null, 2), person('2', 'Олена', 1), person('3', 'Ann', 0), person('4', null, 9), person('5', 'émile', 3),
    ], 'en');
    expect(sorted.map((p) => p.id)).toEqual(['3', '5', '2', '4', '1']);
    // Ukrainian puts Cyrillic first
    expect(sortPeople(sorted, 'uk').map((p) => p.id)).toEqual(['2', '3', '5', '4', '1']);
  });

  it('compares names in the active language', () => {
    const names = sortPeople([person('1', 'Ärzte', 1), person('2', 'Zoe', 1)], 'sv').map((p) => p.name);
    expect(names).toEqual(['Zoe', 'Ärzte']);
  });
});
