import { describe, it, expect } from 'vitest';
import type { Person } from '../../../shared/types.js';
import { EMPTY_FORM, formOf, inputOf, linkHost, matchPeople } from './personForm.js';

const roy: Person = {
  id: 'b8e4117cf1d6615b', name: 'Roy Avery', alias: 'Roy', comment: null, links: ['https://example.com/roy'], birth: '1961-03-04',
  gender: 'male', avatarVersion: null, avatar: null, photoCount: 2,
};
const unknown: Person = { ...roy, name: null, alias: null, links: [], birth: null, gender: null };

describe('person form', () => {
  it('reads a person into the fields, with a date birth as a date', () => {
    expect(formOf(roy)).toEqual({
      name: 'Roy Avery', alias: 'Roy', comment: '', links: ['https://example.com/roy'], birthKind: 'date', birth: '1961-03-04', gender: 'male',
    });
    expect(formOf(null)).toEqual(EMPTY_FORM);
  });

  it('sends only what changed', () => {
    const form = { ...formOf(roy), comment: ' Uncle ', links: ['https://example.com/roy', '', ' https://social.example/roy '] };
    expect(inputOf(form, roy)).toEqual({ comment: 'Uncle', links: ['https://example.com/roy', 'https://social.example/roy'] });
    expect(inputOf(formOf(roy), roy)).toEqual({});
  });

  it('clears fields with null', () => {
    expect(inputOf({ ...formOf(roy), alias: '', gender: '', birth: '' }, roy)).toEqual({ alias: null, gender: null, birth: null });
  });

  it('sends the filled fields of a new person and nothing empty', () => {
    expect(inputOf({ ...EMPTY_FORM, name: ' Ann ', birth: '1990' }, null)).toEqual({ name: 'Ann', birth: '1990' });
    expect(inputOf(EMPTY_FORM, null)).toEqual({});
  });

  it('sends only the name for an unknown person until it has one', () => {
    expect(inputOf({ ...formOf(unknown), alias: 'x' }, unknown)).toEqual({});
    expect(inputOf({ ...formOf(unknown), name: 'Bob', alias: 'Bobby' }, unknown)).toEqual({ name: 'Bob', alias: 'Bobby' });
  });

  it('sends a chosen avatar or the default one', () => {
    const rect = { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 };
    expect(inputOf({ ...formOf(roy), avatar: { photoId: 7, rect } }, roy)).toEqual({ avatar: { photoId: 7, rect } });
    expect(inputOf({ ...formOf(roy), avatar: null }, roy)).toEqual({ avatar: null });
  });
});

describe('helpers', () => {
  it('shows the host of a link', () => {
    expect(linkHost('https://www.example.com/roy?x=1')).toBe('example.com');
    expect(linkHost('not a url')).toBe('not a url');
  });

  it('finds people by name or alias ignoring case', () => {
    const people = [{ name: 'Roy Avery', alias: 'Bear' }, { name: 'Ann', alias: null }, { name: null, alias: null }];
    expect(matchPeople(people, 'BEAR')).toEqual([people[0]]);
    expect(matchPeople(people, 'an')).toEqual([people[1]]);
    expect(matchPeople(people, ' ')).toEqual(people);
  });
});
