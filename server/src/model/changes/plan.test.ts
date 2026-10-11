import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTestDatabase } from '../../auth/testing.js';
import { buildLibrary, type TestLibrary } from '../testLibrary.js';
import type { Permission } from '../../../../shared/types.js';
import type { ChangeFailure, ParsedChangeset } from './parse.js';
import type { Plan } from './plan.js';

let tmpDir: string;
let cleanup: () => void;
let parse: typeof import('./parse.js');
let planner: typeof import('./plan.js');
let PERMISSIONS: readonly Permission[];
let lib: TestLibrary;

const ROY = 'b8e4117cf1d6615b';
const BIRDS = 'c9ea9fa67022f38a3c771894d2a8a468';

beforeAll(async () => {
  ({ tmpDir, cleanup } = await openTestDatabase('paloma_plan_test_'));
  await (await import('../../plugins/index.js')).pluginRegistry.init();
  parse = await import('./parse.js');
  planner = await import('./plan.js');
  ({ PERMISSIONS } = await import('../../auth/permissions.js'));
});

afterAll(() => cleanup());

beforeEach(async () => {
  lib = await buildLibrary(fs.mkdtempSync(path.join(tmpDir, 'photos_')), {
    a: {
      photos: { p1: { dateTaken: '2024-01-02' }, p2: { dateTaken: '2024-01-01' }, p3: {} },
      sidecar: {
        albums: { [BIRDS]: { name: 'Birds' } },
        people: { [ROY]: { name: 'Roy Avery', email: null, googleId: null } },
        photos: { 'p1.jpg': { star: true, keywords: ['old', 'Trip'], albums: [BIRDS], faces: [{ person: ROY }] } },
      },
    },
  });
});

async function plan(body: unknown, permissions: readonly Permission[] = PERMISSIONS): Promise<Plan | ChangeFailure> {
  const parsed = parse.parseChangeset(body);
  if (parse.isFailure(parsed)) return parsed;
  return planner.planChangeset((parsed as ParsedChangeset).changes, new Set(permissions));
}
const planned = async (body: unknown, permissions?: readonly Permission[]): Promise<Plan> => {
  const result = await plan(body, permissions);
  expect('status' in result, JSON.stringify(result)).toBe(false);
  return result as Plan;
};
const failed = async (body: unknown, permissions?: readonly Permission[]): Promise<ChangeFailure> => {
  const result = await plan(body, permissions);
  expect('status' in result, JSON.stringify(result)).toBe(true);
  return result as ChangeFailure;
};

describe('planChangeset', () => {
  it('refuses a change without its permission, naming it', async () => {
    const result = await failed({ changes: [{ op: 'update', type: 'photo', id: lib.id.p2, set: { star: true } }] }, ['library.view']);
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: 'permission_required', params: { index: 0, permission: 'photos.edit' } });
  });

  it('needs people.manage for photo people even together with a caption', async () => {
    const result = await failed(
      { changes: [{ op: 'update', type: 'photo', id: lib.id.p2, set: { caption: 'x', people: { add: [ROY] } } }] },
      ['library.view', 'photos.edit'],
    );
    expect(result.body.params).toEqual({ index: 0, permission: 'people.manage' });
  });

  it('names the change with an unknown id', async () => {
    const result = await failed({ changes: [
      { op: 'update', type: 'photo', ids: [lib.id.p2, lib.id.p3], set: { star: true } },
      { op: 'update', type: 'album', id: 'ffffffffffffffffffffffffffffffff', set: { name: 'X' } },
    ] });
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: 'object_not_found', params: { index: 1, field: 'ids' } });
  });

  it('adds tags to photos that differ, ignoring case', async () => {
    const result = await planned({ changes: [{ op: 'update', type: 'photo', ids: [lib.id.p1, lib.id.p2], set: { tags: { add: ['trip', 'sea'] } } }] });
    expect(result.results[0].objects).toEqual([
      { id: lib.id.p1, changes: { tags: { from: ['old', 'Trip'], to: ['old', 'Trip', 'sea'] } } },
      { id: lib.id.p2, changes: { tags: { from: [], to: ['trip', 'sea'] } } },
    ]);
  });

  it('lists only the photos whose values change', async () => {
    const result = await planned({ changes: [{ op: 'update', type: 'photo', ids: [lib.id.p1, lib.id.p2], set: { star: true } }] });
    expect(result.results[0]).toMatchObject({ ids: [lib.id.p1, lib.id.p2], objects: [{ id: lib.id.p2, changes: { star: { from: false, to: true } } }], more: 0 });
    const step = result.steps[0] as Extract<Plan['steps'][number], { kind: 'photos' }>;
    expect(step.writes.map((write) => write.id)).toEqual([lib.id.p2]);
  });

  it('lets later changes see earlier ones and resolves refs', async () => {
    const result = await planned({ changes: [
      { op: 'create', type: 'person', ref: 'ann', set: { name: 'Ann' } },
      { op: 'update', type: 'photo', ids: [lib.id.p2], set: { people: { add: ['@ann'] } } },
      { op: 'update', type: 'photo', ids: [lib.id.p2], set: { people: { add: ['@ann'] } } },
    ] });
    expect(result.results[0]).toMatchObject({ ids: ['@ann'], objects: [{ id: '@ann', changes: { name: { from: null, to: 'Ann' } } }] });
    expect(result.results[1].objects).toEqual([{ id: lib.id.p2, changes: { people: { from: [], to: [{ id: '@ann', rect: null }] } } }]);
    expect(result.results[2].objects).toEqual([]);
  });

  it('checks album covers against the album after earlier changes', async () => {
    expect((await failed({ changes: [{ op: 'update', type: 'album', id: BIRDS, set: { cover: lib.id.p2 } }] })).body)
      .toMatchObject({ code: 'cover_not_in_album', params: { index: 0, field: 'cover' } });
    await planned({ changes: [
      { op: 'update', type: 'photo', id: lib.id.p2, set: { albums: { add: [BIRDS] } } },
      { op: 'update', type: 'album', id: BIRDS, set: { cover: lib.id.p2 } },
    ] });
  });

  it('refuses an invalid edit step with the change index', async () => {
    const result = await failed({ changes: [{ op: 'update', type: 'photo', id: lib.id.p2, set: { edits: [{ filter: 'brightness', amount: 500 }] } }] });
    expect(result.body).toMatchObject({ code: 'edits_invalid', params: { index: 0, field: 'edits', filter: 'brightness' } });
  });

  it('refuses an invalid person link', async () => {
    const result = await failed({ changes: [{ op: 'update', type: 'person', id: ROY, set: { links: ['javascript:alert(1)'] } }] });
    expect(result.body).toMatchObject({ code: 'invalid_field', params: { index: 0, field: 'links' } });
  });

  it('refuses a changeset touching a folder with an unreadable sidecar', async () => {
    fs.writeFileSync(path.join(lib.dir.a, '.paloma.json'), '{broken');
    const result = await failed({ changes: [{ op: 'update', type: 'photo', id: lib.id.p2, set: { star: true } }] });
    expect(result.status).toBe(409);
    expect(result.body.failedFolders).toEqual([lib.dir.a]);
  });
});
