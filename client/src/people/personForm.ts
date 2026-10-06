import type { Gender, Person, PersonInput, PersonSummary, RelativeRect } from '../../../shared/types.js';

export type BirthKind = 'year' | 'date';

/** The person editor's fields as typed. */
export interface PersonForm {
  name: string;
  alias: string;
  comment: string;
  /** One row per link; empty rows are dropped when saving */
  links: string[];
  birthKind: BirthKind;
  birth: string;
  gender: Gender | '';
  /** The chosen avatar face; null for the default one, undefined when unchanged */
  avatar?: { photoId: number; rect: RelativeRect } | null;
}

export const EMPTY_FORM: PersonForm = { name: '', alias: '', comment: '', links: [''], birthKind: 'year', birth: '', gender: '' };

/** The editor's fields for a person, or empty ones for a new person. */
export function formOf(person: Person | null): PersonForm {
  if (!person) return { ...EMPTY_FORM, links: [''] };
  return {
    name: person.name ?? '',
    alias: person.alias ?? '',
    comment: person.comment ?? '',
    links: person.links.length > 0 ? [...person.links] : [''],
    birthKind: person.birth && person.birth.length > 4 ? 'date' : 'year',
    birth: person.birth ?? '',
    gender: person.gender ?? '',
  };
}

/** Whether a person has a name: an unknown person only offers the name. */
export const isKnown = (person: Pick<PersonSummary, 'name'> | null): boolean => person?.name != null;

const text = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/**
 * What to send for the form: for a new person every filled field, for an existing one only what changed.
 * Profile fields beyond the name are sent only when the person is or becomes known.
 */
export function inputOf(form: PersonForm, person: Person | null): PersonInput {
  const before = formOf(person);
  const input: PersonInput = {};
  const name = form.name.trim();
  if (name !== '' && name !== (person?.name ?? '')) input.name = name;
  if (name === '' && !isKnown(person)) return input;

  const changed = <K extends keyof PersonInput>(key: K, value: PersonInput[K], old: PersonInput[K]) => {
    if (JSON.stringify(value) !== JSON.stringify(old) && !(person === null && (value === null || (Array.isArray(value) && value.length === 0)))) {
      input[key] = value;
    }
  };
  const links = (rows: string[]) => rows.map((row) => row.trim()).filter((row) => row !== '');
  changed('alias', text(form.alias), text(before.alias));
  changed('comment', text(form.comment), text(before.comment));
  changed('links', links(form.links), links(before.links));
  changed('birth', text(form.birth), text(before.birth));
  changed('gender', form.gender === '' ? null : form.gender, before.gender === '' ? null : before.gender);
  if (form.avatar !== undefined) input.avatar = form.avatar;
  return input;
}

/** Hosts of the links, to show next to a person's name, e.g. `example.com`. */
export function linkHost(link: string): string {
  try {
    return new URL(link).host.replace(/^www\./, '');
  } catch {
    return link;
  }
}

/** People whose name or alias contains the query, ignoring case; unknown people only for an empty query. */
export function matchPeople<T extends Pick<PersonSummary, 'name' | 'alias'>>(people: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return [...people];
  return people.filter((person) => [person.name, person.alias].some((value) => value?.toLocaleLowerCase().includes(needle)));
}
