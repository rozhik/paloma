import { describe, it, expect } from 'vitest';
import { isFailure, parseChangeset, type ChangeFailure, type ParsedChangeset } from './parse.js';

const fails = (body: unknown): ChangeFailure => {
  const result = parseChangeset(body);
  expect(isFailure(result), JSON.stringify(result)).toBe(true);
  return result as ChangeFailure;
};
const parses = (body: unknown): ParsedChangeset => {
  const result = parseChangeset(body);
  expect(isFailure(result), JSON.stringify(result)).toBe(false);
  return result as ParsedChangeset;
};

describe('parseChangeset', () => {
  it('accepts two changes and removes duplicate ids', () => {
    const { changes, dryRun } = parses({ changes: [
      { op: 'update', type: 'photo', ids: [3, 7, 3], set: { star: true } },
      { op: 'update', type: 'album', id: 'c9ea', set: { name: 'Birds' } },
    ] });
    expect(dryRun).toBe(false);
    expect(changes.map((c) => [c.index, c.op, c.type, c.ids])).toEqual([[0, 'update', 'photo', [3, 7]], [1, 'update', 'album', ['c9ea']]]);
  });

  it('refuses an empty or too long changeset', () => {
    expect(fails({ changes: [] }).body.params).toEqual({ field: 'changes' });
    expect(fails({}).status).toBe(400);
    expect(fails({ changes: Array.from({ length: 1001 }, () => ({ op: 'update', type: 'photo', id: 1, set: { star: true } })) }).status).toBe(400);
  });

  it('refuses a changeset naming too many objects', () => {
    const ids = Array.from({ length: 3000 }, (_, i) => i + 1);
    const result = fails({ changes: [
      { op: 'update', type: 'photo', ids, set: { star: true } },
      { op: 'update', type: 'photo', ids: ids.map((id) => id + 3000), set: { star: true } },
    ] });
    expect(result.body.params).toMatchObject({ index: 1 });
  });

  it('names read-only and unknown attributes', () => {
    expect(fails({ changes: [{ op: 'update', type: 'photo', id: 7, set: { fileName: 'new.jpg' } }] }).body)
      .toMatchObject({ code: 'read_only_field', params: { index: 0, field: 'fileName' } });
    expect(fails({ changes: [{ op: 'update', type: 'album', id: 'x', set: { photoCount: 3 } }] }).body)
      .toMatchObject({ code: 'read_only_field', params: { field: 'photoCount' } });
    expect(fails({ changes: [{ op: 'update', type: 'photo', id: 7, set: { colour: 'red' } }] }).body)
      .toMatchObject({ code: 'invalid_field', params: { field: 'colour' } });
  });

  it('refuses folders and tags', () => {
    expect(fails({ changes: [{ op: 'update', type: 'tag', id: 'dawn', set: { name: 'x' } }] }).body)
      .toMatchObject({ code: 'read_only_field', params: { index: 0, field: 'type' } });
  });

  it('refuses ops a type does not have, and wrong values', () => {
    expect(fails({ changes: [{ op: 'create', type: 'photo', set: {} }] }).body.params).toEqual({ index: 0, field: 'op' });
    expect(fails({ changes: [{ op: 'update', type: 'photo', id: 7, set: { star: 'yes' } }] }).body.params).toEqual({ index: 0, field: 'star' });
    expect(fails({ changes: [{ op: 'update', type: 'photo', id: 7, set: { location: { lat: 100, lon: 0 } } }] }).body.params)
      .toEqual({ index: 0, field: 'location.lat' });
    expect(fails({ changes: [{ op: 'create', type: 'album', set: { name: 'Trip', photos: [] } }] }).body.params)
      .toEqual({ index: 0, field: 'photos' });
  });

  it('needs either id or ids, and a non-empty set', () => {
    expect(fails({ changes: [{ op: 'update', type: 'photo', set: { star: true } }] }).body.params).toEqual({ index: 0, field: 'ids' });
    expect(fails({ changes: [{ op: 'update', type: 'photo', id: 1, ids: [2], set: { star: true } }] }).body.params).toEqual({ index: 0, field: 'ids' });
    expect(fails({ changes: [{ op: 'update', type: 'photo', id: 1, set: {} }] }).body.params).toEqual({ index: 0, field: 'set' });
  });

  it('resolves refs defined earlier and refuses refs used too early or twice', () => {
    parses({ changes: [
      { op: 'create', type: 'person', ref: 'ann', set: { name: 'Ann' } },
      { op: 'update', type: 'photo', ids: [3, 7], set: { people: { add: ['@ann'] } } },
    ] });
    expect(fails({ changes: [
      { op: 'update', type: 'photo', ids: [3], set: { people: { add: [{ person: '@ann' }] } } },
      { op: 'create', type: 'person', ref: 'ann', set: { name: 'Ann' } },
    ] }).body.params).toEqual({ index: 0, field: 'people' });
    expect(fails({ changes: [
      { op: 'create', type: 'person', ref: 'ann', set: {} },
      { op: 'create', type: 'person', ref: 'ann', set: {} },
    ] }).body.params).toEqual({ index: 1, field: 'ref' });
  });
});
