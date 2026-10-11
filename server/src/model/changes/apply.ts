import { SidecarService, type FieldPatch } from '../../services/SidecarService.js';
import { saveFolderByFolder } from '../../services/folderChanges.js';
import { photoFieldPatch } from '../../services/photoApi.js';
import {
  addAlbumPhotos, createAlbumFromPhotos, deleteAlbumEverywhere, editAlbumProperties, removeAlbumPhotos,
} from '../../services/albumApi.js';
import { createPerson, deletePerson, updatePerson } from '../../services/peopleApi.js';
import { placeResolver } from '../../services/geocoding.js';
import { grantAlbum } from '../../auth/users.js';
import type { Principal } from '../../auth/principal.js';
import type { ApiError, ChangeResult, ChangesetResponse } from '../../../../shared/types.js';
import { isFailure, parseChangeset, type ChangeFailure } from './parse.js';
import { planChangeset, type Plan, type Step } from './plan.js';

// Applying a planned changeset through the same services as the REST endpoints, so the folder files end up
// exactly as those endpoints leave them.

type StepResult = { status: number; body: unknown };

/** A failed step: its error, naming the change, with the results of the changes applied before it. */
export interface ApplyFailure {
  status: 403 | 404 | 409 | 500;
  body: ApiError & { results: ChangeResult[]; notChangedFolders?: string[] };
}

/** Replaces `@ref` strings anywhere in a value with the ids of the objects created for them. */
function resolveRefs<T>(value: T, refs: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') return (refs.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => resolveRefs(item, refs)) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveRefs(item, refs)])) as T;
  }
  return value;
}

/** Who applies a changeset: their permissions, and the user and access a new album is granted to. */
export type ChangePrincipal = Pick<Principal, 'permissions' | 'user' | 'access'>;

class Applier {
  readonly refs = new Map<string, string>();

  constructor(private readonly principal: ChangePrincipal) {}

  private id(value: string): string {
    return this.refs.get(value) ?? value;
  }

  async run(step: Step): Promise<StepResult | null> {
    switch (step.kind) {
      case 'photos': return this.photos(step);
      case 'createAlbum': {
        const result = await createAlbumFromPhotos({
          name: step.name, photoIds: step.photos,
          ...(step.description ? { description: step.description } : {}), ...(step.location ? { location: step.location } : {}),
        });
        if (result.status !== 200) return result;
        this.refs.set(step.ref, result.body.token);
        // A user with limited access keeps access to the album they made, also for the rest of this changeset
        const { user, access } = this.principal;
        if (user && !access.all) {
          await grantAlbum(user.id, result.body.token);
          access.albums.push(result.body.token);
        }
        return null;
      }
      case 'updateAlbum': return this.ok(await editAlbumProperties(this.id(step.id), step.body));
      case 'deleteAlbum': return this.ok(await deleteAlbumEverywhere(this.id(step.id)));
      case 'createPerson': {
        const result = await createPerson(step.input);
        if (result.status !== 200) return result;
        this.refs.set(step.ref, result.body.id);
        return null;
      }
      case 'updatePerson': return this.ok(await updatePerson(this.id(step.id), step.input));
      case 'deletePerson': return this.ok(await deletePerson(this.id(step.id)));
    }
  }

  private ok(result: StepResult): StepResult | null {
    return result.status === 200 ? null : result;
  }

  /** Field and people changes in one write per folder, then album membership through the album services. */
  private async photos(step: Extract<Step, { kind: 'photos' }>): Promise<StepResult | null> {
    const patches = new Map<string, Record<string, FieldPatch>>();
    for (const write of step.writes) {
      const patch: FieldPatch = photoFieldPatch(write.file, write.values);
      if (write.removePeople.length > 0) patch.removePeople = write.removePeople.map((person) => this.id(person));
      if (write.addMarks.length > 0) patch.addMarks = write.addMarks.map((mark) => ({ ...mark, person: this.id(mark.person) }));
      patches.set(write.folderPath, { ...patches.get(write.folderPath), [write.fileName]: patch });
    }
    if (patches.size > 0) {
      const modified = new Date().toISOString();
      const error = await saveFolderByFolder('changeset', [...patches.keys()], (dir, data) => SidecarService.patchPhotos(data, patches.get(dir)!, modified));
      if (error) return error;
    }
    for (const [token, photoIds] of step.albumAdds) {
      const result = await addAlbumPhotos(this.id(token), { photoIds });
      if (result.status !== 200) return result;
    }
    for (const [token, photoIds] of step.albumRemoves) {
      const result = await removeAlbumPhotos(this.id(token), { photoIds });
      if (result.status !== 200) return result;
    }
    return null;
  }
}

/**
 * Writes a plan step by step, in order. Stops at the first failing step: the changes before it stay, and the
 * failure names that change and the folders it could not write.
 */
export async function applyPlan(plan: Plan, principal: ChangePrincipal): Promise<ChangesetResponse | ApplyFailure> {
  const applier = new Applier(principal);
  try {
    for (const step of plan.steps) {
      const failed = await applier.run(step);
      if (!failed) continue;
      const body = failed.body as ApiError;
      return {
        status: (failed.status === 403 || failed.status === 404 || failed.status === 409 ? failed.status : 500),
        body: {
          ...body,
          params: { ...body.params, index: step.index },
          results: resolveRefs(plan.results.filter((result) => result.index < step.index), applier.refs),
          ...(body.failedFolders ? { notChangedFolders: body.failedFolders } : {}),
        },
      };
    }
  } finally {
    if (plan.locations) placeResolver.wake();
  }
  return { dryRun: false, results: resolveRefs(plan.results, applier.refs) };
}

/**
 * `POST /api/changes` and MCP `apply_changes`: checks a changeset for the current request and, unless it is a
 * dry run, applies it. Responds with the results, or the failure naming the change at fault.
 */
export async function runChangeset(body: unknown, principal: ChangePrincipal): Promise<{ status: 200; body: ChangesetResponse } | ChangeFailure | ApplyFailure> {
  const parsed = parseChangeset(body);
  if (isFailure(parsed)) return parsed;
  const plan = await planChangeset(parsed.changes, principal.permissions);
  if ('status' in plan) return plan;
  if (parsed.dryRun) return { status: 200, body: { dryRun: true, results: plan.results } };
  const applied = await applyPlan(plan, principal);
  return 'status' in applied ? applied : { status: 200, body: applied };
}
