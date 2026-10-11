import { db } from '../../db/index.js';
import { all, BATCH_SIZE, chunked } from '../../db/query.js';
import { photoPeople } from '../../db/schema.js';
import { inArray } from 'drizzle-orm';
import { photoDocumentsById } from '../documents.js';
import { listAlbums, loadMembers, albumFolders } from '../../services/albumApi.js';
import { findPerson, onPhotosOutsideAccess, personVisible } from '../../services/peopleApi.js';
import { parsePersonInput } from '../../services/personValidation.js';
import { validateChain } from '../../services/editChain.js';
import { libraryLookup } from '../../services/libraryImages.js';
import { editsInvalid, photoFileFacts, type PhotoFileFacts } from '../../services/photoApi.js';
import { uniqueKeywords } from '../../services/embeddedText.js';
import { textKey } from '../../services/libraryText.js';
import { sameRect, SidecarService, type FaceMark } from '../../services/SidecarService.js';
import { albumGranted } from '../../auth/scope.js';
import { failure, type ChangeFailure, type ParsedChange } from './parse.js';
import type {
  ChangeResult, EditStep, Geotag, ObjectDiff, Permission, PersonInput, PhotoDocument, RelativeRect,
} from '../../../../shared/types.js';

// Planning a changeset: resolving ids, checking permissions and values, and working out what each change does,
// all without writing. The plan is the result of a dry run and the input of apply.ts.

/** At most this many changed objects are listed per change; the rest are counted in `more`. */
export const MAX_LISTED = 200;

interface PhotoState {
  id: number;
  folderPath: string;
  fileName: string;
  file: PhotoFileFacts;
  detected: { id: number; rect: RelativeRect }[];
  star: boolean;
  hidden: boolean;
  caption: string | null;
  tags: string[];
  location: Geotag | null;
  albums: string[];
  /** Faces as stored: one item per face, `rect` absent for a mark without a frame */
  people: { person: string; rect?: RelativeRect }[];
  edits: EditStep[];
}

interface AlbumState {
  id: string;
  name: string | null;
  description: string | null;
  location: string | null;
  cover: number | null;
  /** Visible member ids before the changeset; photo states override it for loaded photos */
  members: Set<number>;
  deleted: boolean;
}

interface PersonState {
  id: string;
  known: boolean;
  values: Record<string, unknown>;
  deleted: boolean;
}

/** Field values to write to one photo's sidecar entry, and the people changes. */
export interface PhotoWrite {
  id: number;
  folderPath: string;
  fileName: string;
  file: PhotoFileFacts;
  values: { star?: boolean; hidden?: boolean; caption?: string; keywords?: string[]; location?: Geotag | null; edits?: EditStep[] };
  removePeople: string[];
  addMarks: FaceMark[];
}

/** One write step of a plan; ids may be `@ref`s of objects created by earlier steps. */
export type Step =
  | { kind: 'photos'; index: number; writes: PhotoWrite[]; albumAdds: Map<string, number[]>; albumRemoves: Map<string, number[]> }
  | { kind: 'createAlbum'; index: number; ref: string; name: string; description?: string; location?: string; photos: number[] }
  | { kind: 'updateAlbum'; index: number; id: string; body: Record<string, unknown> }
  | { kind: 'deleteAlbum'; index: number; id: string }
  | { kind: 'createPerson'; index: number; ref: string; input: PersonInput }
  | { kind: 'updatePerson'; index: number; id: string; input: PersonInput }
  | { kind: 'deletePerson'; index: number; id: string };

export interface Plan {
  results: ChangeResult[];
  steps: Step[];
  /** Whether a step changes a location, so place names need resolving */
  locations: boolean;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const isRef = (id: unknown): id is string => typeof id === 'string' && id.startsWith('@');

/** The permission each photo attribute needs. */
const PHOTO_PERMISSION: Record<string, Permission> = {
  star: 'photos.edit', hidden: 'photos.edit', caption: 'photos.edit', tags: 'photos.edit', location: 'photos.edit', edits: 'photos.edit',
  albums: 'albums.manage', people: 'people.manage',
};

/** The permissions a change needs, in the order they are checked. */
function permissionsOf(change: ParsedChange): Permission[] {
  if (change.type === 'album') return ['albums.manage'];
  if (change.type === 'person') return ['people.manage'];
  return [...new Set(Object.keys(change.set).map((key) => PHOTO_PERMISSION[key]))];
}

/** A list change: an array replaces the list, `{add, remove}` adjusts it. */
type ListChange = unknown[] | { add?: unknown[]; remove?: unknown[] };
const isReplace = (value: ListChange): value is unknown[] => Array.isArray(value);

type Face = PhotoState['people'][number];

/**
 * Faces with a person's mark added, as `withMark` stores it, for ids that may still be `@ref`s: a mark without a
 * frame is added only when the person has no face yet; one with a frame replaces the person's frameless marks.
 * Undefined when nothing changes.
 */
function facesWithMark(faces: readonly Face[], mark: FaceMark): Face[] | undefined {
  const own = faces.filter((face) => face.person === mark.person);
  if (!mark.rect) return own.length > 0 ? undefined : [...faces, { person: mark.person }];
  if (own.some((face) => face.rect && sameRect(face.rect, mark.rect!))) return undefined;
  return [...faces.filter((face) => !(face.person === mark.person && !face.rect)), { person: mark.person, rect: mark.rect }];
}

/** Faces without any of the person's; undefined when they have none. */
function facesWithout(faces: readonly Face[], person: string): Face[] | undefined {
  const kept = faces.filter((face) => face.person !== person);
  return kept.length < faces.length ? kept : undefined;
}

/** Photo document → the state a changeset works on. */
function photoState(doc: PhotoDocument, file: PhotoFileFacts): PhotoState {
  return {
    id: doc.id, folderPath: doc.folder.path, fileName: doc.fileName, file, detected: doc.detectedFaces,
    star: doc.star, hidden: doc.hidden, caption: doc.caption, tags: doc.tags, location: doc.location,
    albums: doc.albums.map((album) => album.id),
    people: doc.people.map((face) => (face.rect ? { person: face.id, rect: face.rect } : { person: face.id })),
    edits: doc.edits,
  };
}

/** The photo attributes as the document shows them, for diffs. */
function photoView(state: PhotoState): Record<string, unknown> {
  return {
    star: state.star, hidden: state.hidden, caption: state.caption, tags: state.tags, location: state.location,
    albums: state.albums, people: state.people.map((face) => ({ id: face.person, rect: face.rect ?? null })), edits: state.edits,
  };
}

/** The attributes that differ between two views, with their values before and after. */
function diffOf(before: Record<string, unknown>, after: Record<string, unknown>, keys = Object.keys(after)): ObjectDiff['changes'] {
  const changes: ObjectDiff['changes'] = {};
  for (const key of keys) if (!same(before[key], after[key])) changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
  return changes;
}

class Planner {
  private photos = new Map<number, PhotoState>();
  private albums = new Map<string, AlbumState>();
  private people = new Map<string, PersonState>();
  private readonly results: ChangeResult[] = [];
  private readonly steps: Step[] = [];
  private locations = false;

  constructor(private readonly changes: ParsedChange[], private readonly permissions: ReadonlySet<Permission>) {}

  /** Loads every photo, album and person the changeset names, as the current request sees them. */
  private async load(): Promise<void> {
    const photoIds = new Set<number>();
    const albumIds = new Set<string>();
    const personIds = new Set<string>();
    for (const change of this.changes) {
      const ids = change.ids.filter((id) => !isRef(id));
      if (change.type === 'photo') ids.forEach((id) => photoIds.add(id as number));
      if (change.type === 'album') ids.forEach((id) => albumIds.add(String(id)));
      if (change.type === 'person') ids.forEach((id) => personIds.add(String(id)));
      for (const id of (change.set.photos as number[] | undefined) ?? []) photoIds.add(id);
      if (typeof change.set.cover === 'number') photoIds.add(change.set.cover);
      for (const item of this.listItems(change.set.albums)) if (!isRef(item)) albumIds.add(item as string);
      for (const item of this.listItems(change.set.people)) {
        const id = typeof item === 'object' && item !== null ? (item as { person: string }).person : item;
        if (!isRef(id)) personIds.add(id as string);
      }
    }
    const docs = await photoDocumentsById([...photoIds]);
    const files = await photoFileFacts(docs.map((doc) => doc.id));
    for (const doc of docs) this.photos.set(doc.id, photoState(doc, files.get(doc.id)!));

    if (albumIds.size > 0) {
      const members = await loadMembers([...albumIds]);
      for (const album of await listAlbums([...albumIds])) {
        this.albums.set(album.token, {
          id: album.token, name: album.name, description: album.description, location: album.location, cover: album.coverPhotoId,
          members: new Set((members.get(album.token) ?? []).map((member) => member.id)), deleted: false,
        });
      }
    }
    for (const id of personIds) {
      if (!/^[0-9a-f]{16}$/.test(id) || !await personVisible(id)) continue;
      const person = (await findPerson(id))!;
      const { name, alias, comment, links, birth, gender } = person;
      this.people.set(id, { id, known: name !== null, values: { name, alias, comment, links, birth, gender }, deleted: false });
    }
  }

  private listItems(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'object' && value !== null) {
      const { add = [], remove = [] } = value as { add?: unknown[]; remove?: unknown[] };
      return [...add, ...remove];
    }
    return [];
  }

  private photo(index: number, id: number, field = 'ids'): PhotoState | ChangeFailure {
    return this.photos.get(id) ?? failure(404, 'object_not_found', `No photo ${id}`, { index, field, type: 'photo', id });
  }

  private album(index: number, id: string, field = 'ids', changing = true): AlbumState | ChangeFailure {
    const album = this.albums.get(id);
    if (!album || album.deleted) return failure(404, 'object_not_found', `No album ${id}`, { index, field, type: 'album', id });
    // A user who sees an album only through some of its photos cannot change it for everyone
    if (changing && !isRef(id) && !albumGranted(id)) {
      return failure(403, 'album_not_granted', 'You can change only albums you were given access to', { index, field, token: id });
    }
    return album;
  }

  private person(index: number, id: string, field = 'ids'): PersonState | ChangeFailure {
    const person = this.people.get(id);
    return person && !person.deleted ? person : failure(404, 'object_not_found', `No person ${id}`, { index, field, type: 'person', id });
  }

  /** Whether a photo is in an album after the changes so far. */
  private isMember(album: AlbumState, photoId: number): boolean {
    const photo = this.photos.get(photoId);
    return photo ? photo.albums.includes(album.id) : album.members.has(photoId);
  }

  private result(change: ParsedChange, ids: (number | string)[], objects: ObjectDiff[]): void {
    const changed = objects.filter((object) => Object.keys(object.changes).length > 0);
    this.results.push({
      index: change.index, op: change.op, type: change.type, ids,
      objects: changed.slice(0, MAX_LISTED), more: Math.max(0, changed.length - MAX_LISTED),
    });
  }

  async plan(): Promise<Plan | ChangeFailure> {
    await this.load();
    for (const change of this.changes) {
      const missing = permissionsOf(change).find((permission) => !this.permissions.has(permission));
      if (missing) return failure(403, 'permission_required', `This needs the permission ${missing}`, { index: change.index, permission: missing });
      const problem = await this.planChange(change);
      if (problem) return problem;
    }
    return { results: this.results, steps: this.steps, locations: this.locations };
  }

  private async planChange(change: ParsedChange): Promise<ChangeFailure | null> {
    switch (`${change.op} ${change.type}`) {
      case 'update photo': return this.updatePhotos(change);
      case 'create album': return this.createAlbum(change);
      case 'update album': return this.updateAlbums(change);
      case 'delete album': return this.deleteAlbums(change);
      case 'create person': return this.createPerson(change);
      case 'update person': return this.updatePeople(change);
      case 'delete person': return this.deletePeople(change);
      default: return failure(400, 'invalid_field', `Cannot ${change.op} a ${change.type}`, { index: change.index, field: 'op' });
    }
  }

  // --- Photos ---

  private async updatePhotos(change: ParsedChange): Promise<ChangeFailure | null> {
    const { index, set } = change;
    const targets: PhotoState[] = [];
    for (const id of change.ids) {
      const photo = this.photo(index, id as number);
      if ('status' in photo) return photo;
      targets.push(photo);
    }

    let edits: EditStep[] | undefined;
    if (set.edits !== undefined) {
      const check = validateChain(set.edits, libraryLookup);
      if (!check.ok) {
        const body = editsInvalid(check.problem);
        return { status: 400, body: { ...body, error: `Change ${index}, edits: ${body.error}`, params: { ...body.params, index, field: 'edits' } } };
      }
      edits = check.steps;
    }
    // Albums and people named in the change must exist (and albums be changeable) before any photo is touched
    for (const item of this.listItems(set.albums)) {
      const album = this.album(index, item as string, 'albums');
      if ('status' in album) return album;
    }
    for (const item of this.listItems(set.people)) {
      const id = typeof item === 'object' && item !== null ? (item as { person: string }).person : item as string;
      const person = this.person(index, id, 'people');
      if ('status' in person) return person;
    }

    const writes: PhotoWrite[] = [];
    const albumAdds = new Map<string, number[]>();
    const albumRemoves = new Map<string, number[]>();
    const objects: ObjectDiff[] = [];
    for (const photo of targets) {
      const before = photoView(photo);
      const write: PhotoWrite = {
        id: photo.id, folderPath: photo.folderPath, fileName: photo.fileName, file: photo.file, values: {}, removePeople: [], addMarks: [],
      };
      if (set.star !== undefined) photo.star = set.star as boolean;
      if (set.hidden !== undefined) photo.hidden = set.hidden as boolean;
      if (set.caption !== undefined) photo.caption = (set.caption as string) === '' ? null : set.caption as string;
      if (set.location !== undefined) photo.location = set.location as Geotag | null;
      if (edits !== undefined) photo.edits = edits;
      if (set.tags !== undefined) photo.tags = this.nextTags(photo.tags, set.tags as ListChange);
      if (set.albums !== undefined) {
        const next = this.nextIds(photo.albums, set.albums as ListChange);
        for (const token of next.filter((token) => !photo.albums.includes(token))) albumAdds.set(token, [...(albumAdds.get(token) ?? []), photo.id]);
        for (const token of photo.albums.filter((token) => !next.includes(token))) albumRemoves.set(token, [...(albumRemoves.get(token) ?? []), photo.id]);
        photo.albums = next;
      }
      if (set.people !== undefined) {
        const problem = this.nextPeople(index, photo, set.people as ListChange, write);
        if (problem) return problem;
      }

      const after = photoView(photo);
      const changes = diffOf(before, after);
      if (Object.keys(changes).length === 0) continue;
      objects.push({ id: photo.id, changes });
      if (changes.star) write.values.star = photo.star;
      if (changes.hidden) write.values.hidden = photo.hidden;
      if (changes.caption) write.values.caption = photo.caption ?? '';
      if (changes.tags) write.values.keywords = photo.tags;
      if (changes.location) {
        write.values.location = photo.location;
        this.locations = true;
      }
      if (changes.edits) write.values.edits = photo.edits;
      if (Object.keys(write.values).length > 0 || write.removePeople.length > 0 || write.addMarks.length > 0) writes.push(write);
    }
    this.result(change, change.ids, objects);
    if (writes.length > 0 || albumAdds.size > 0 || albumRemoves.size > 0) this.steps.push({ kind: 'photos', index, writes, albumAdds, albumRemoves });
    return null;
  }

  private nextTags(current: string[], value: ListChange): string[] {
    if (isReplace(value)) return uniqueKeywords(value as string[]);
    const removed = new Set(((value.remove ?? []) as string[]).map(textKey));
    return uniqueKeywords([...current, ...((value.add ?? []) as string[])]).filter((tag) => !removed.has(textKey(tag)));
  }

  private nextIds(current: string[], value: ListChange): string[] {
    if (isReplace(value)) return [...new Set(value as string[])];
    const removed = new Set((value.remove ?? []) as string[]);
    return [...new Set([...current, ...((value.add ?? []) as string[])])].filter((id) => !removed.has(id));
  }

  /** Applies a people change to the photo's faces, noting what to write; an error for an unknown detected face. */
  private nextPeople(index: number, photo: PhotoState, value: ListChange, write: PhotoWrite): ChangeFailure | null {
    const toMark = (item: unknown): FaceMark | ChangeFailure => {
      if (typeof item === 'string') return { person: item };
      const { person, face } = item as { person: string; face?: number };
      if (face === undefined) return { person };
      const detected = photo.detected.find((found) => found.id === face);
      return detected ? { person, rect: detected.rect } : failure(404, 'face_not_found', `No detected face ${face} on photo ${photo.id}`, { index, field: 'people' });
    };
    const personOf = (item: unknown) => (typeof item === 'string' ? item : (item as { person: string }).person);

    let removals: string[];
    let additions: unknown[];
    if (isReplace(value)) {
      const keep = new Set(value.map(personOf));
      removals = [...new Set(photo.people.map((face) => face.person))].filter((person) => !keep.has(person));
      additions = value;
    } else {
      removals = (value.remove ?? []).map(personOf);
      additions = value.add ?? [];
    }
    for (const person of removals) {
      const next = facesWithout(photo.people, person);
      if (next === undefined) continue;
      photo.people = next;
      write.removePeople.push(person);
    }
    for (const item of additions) {
      const mark = toMark(item);
      if ('status' in mark) return mark;
      const next = facesWithMark(photo.people, mark);
      if (next === undefined) continue;
      photo.people = next;
      write.addMarks.push(mark);
    }
    return null;
  }

  // --- Albums ---

  private albumView(album: AlbumState): Record<string, unknown> {
    return { name: album.name, description: album.description, location: album.location, cover: album.cover };
  }

  private async createAlbum(change: ParsedChange): Promise<ChangeFailure | null> {
    const { index, set } = change;
    const name = (set.name as string | undefined)?.trim();
    if (!name) return failure(400, 'album_name_required', 'name must be a non-empty string', { index, field: 'name' });
    const photoIds = [...new Set(set.photos as number[])];
    const members: PhotoState[] = [];
    for (const id of photoIds) {
      const photo = this.photo(index, id, 'photos');
      if ('status' in photo) return photo;
      members.push(photo);
    }
    const ref = `@${change.ref ?? index}`;
    const description = (set.description as string | null | undefined) || null;
    const location = (set.location as string | null | undefined) || null;
    const album: AlbumState = { id: ref, name: set.name as string, description, location, cover: null, members: new Set(), deleted: false };
    this.albums.set(ref, album);
    for (const photo of members) photo.albums = [...photo.albums, ref];
    album.cover = photoIds[0] ?? null;
    const changes = diffOf({}, { ...this.albumView(album), photos: photoIds });
    delete changes.cover;
    this.result(change, [ref], [{ id: ref, changes }]);
    this.steps.push({
      kind: 'createAlbum', index, ref, name: set.name as string, photos: photoIds,
      ...(description ? { description } : {}), ...(location ? { location } : {}),
    });
    return null;
  }

  private async updateAlbums(change: ParsedChange): Promise<ChangeFailure | null> {
    const { index, set } = change;
    if (set.name !== undefined && (set.name as string).trim() === '') {
      return failure(400, 'album_name_required', 'name must be a non-empty string', { index, field: 'name' });
    }
    const objects: ObjectDiff[] = [];
    for (const id of change.ids as string[]) {
      const album = this.album(index, id);
      if ('status' in album) return album;
      if (typeof set.cover === 'number' && !this.isMember(album, set.cover)) {
        return failure(400, 'cover_not_in_album', 'cover must be a photo of the album', { index, field: 'cover' });
      }
      const before = this.albumView(album);
      if (set.name !== undefined) album.name = set.name as string;
      if (set.description !== undefined) album.description = (set.description as string | null) || null;
      if (set.location !== undefined) album.location = (set.location as string | null) || null;
      if (set.cover !== undefined) album.cover = set.cover as number | null;
      const changes = diffOf(before, this.albumView(album));
      // Choosing the default cover again is a change even when it shows the same photo
      if (set.cover === null && !changes.cover) changes.cover = { from: before.cover, to: null };
      if (Object.keys(changes).length === 0) continue;
      objects.push({ id, changes });
      const body: Record<string, unknown> = {};
      if (changes.name) body.name = album.name;
      if (changes.description) body.description = album.description ?? '';
      if (changes.location) body.location = album.location ?? '';
      if (changes.cover) body.coverPhotoId = set.cover;
      this.steps.push({ kind: 'updateAlbum', index, id, body });
    }
    this.result(change, change.ids, objects);
    return null;
  }

  private async deleteAlbums(change: ParsedChange): Promise<ChangeFailure | null> {
    const objects: ObjectDiff[] = [];
    for (const id of change.ids as string[]) {
      const album = this.album(change.index, id);
      if ('status' in album) return album;
      album.deleted = true;
      for (const photo of this.photos.values()) photo.albums = photo.albums.filter((token) => token !== id);
      objects.push({ id, changes: { deleted: { from: false, to: true } } });
      this.steps.push({ kind: 'deleteAlbum', index: change.index, id });
    }
    this.result(change, change.ids, objects);
    return null;
  }

  // --- People ---

  private async createPerson(change: ParsedChange): Promise<ChangeFailure | null> {
    const input = parsePersonInput(change.set, false);
    if ('code' in input) return { status: 400, body: { ...input, params: { ...input.params, index: change.index } } };
    const ref = `@${change.ref ?? change.index}`;
    const values = { name: null, alias: null, comment: null, links: [], birth: null, gender: null, ...input };
    this.people.set(ref, { id: ref, known: input.name !== undefined, values, deleted: false });
    this.result(change, [ref], [{ id: ref, changes: diffOf({}, Object.fromEntries(Object.entries(input))) }]);
    this.steps.push({ kind: 'createPerson', index: change.index, ref, input });
    return null;
  }

  private async updatePeople(change: ParsedChange): Promise<ChangeFailure | null> {
    const objects: ObjectDiff[] = [];
    for (const id of change.ids as string[]) {
      const person = this.person(change.index, id);
      if ('status' in person) return person;
      const input = parsePersonInput(change.set, person.known);
      if ('code' in input) return { status: 400, body: { ...input, params: { ...input.params, index: change.index } } };
      const before = { ...person.values };
      person.values = { ...person.values, ...input };
      if (input.name !== undefined) person.known = true;
      const changes = diffOf(before, person.values, Object.keys(input));
      if (Object.keys(changes).length === 0) continue;
      objects.push({ id, changes });
      this.steps.push({ kind: 'updatePerson', index: change.index, id, input });
    }
    this.result(change, change.ids, objects);
    return null;
  }

  private async deletePeople(change: ParsedChange): Promise<ChangeFailure | null> {
    const objects: ObjectDiff[] = [];
    for (const id of change.ids as string[]) {
      const person = this.person(change.index, id);
      if ('status' in person) return person;
      if (!isRef(id) && await onPhotosOutsideAccess(id)) {
        return failure(403, 'outside_access', 'This person is also on photos you cannot see', { index: change.index, field: 'ids' });
      }
      person.deleted = true;
      for (const photo of this.photos.values()) photo.people = photo.people.filter((face) => face.person !== id);
      objects.push({ id, changes: { deleted: { from: false, to: true } } });
      this.steps.push({ kind: 'deletePerson', index: change.index, id });
    }
    this.result(change, change.ids, objects);
    return null;
  }
}

/**
 * Plans a parsed changeset for the current request: every id resolved, every permission and value checked and
 * the effect of each change worked out, in order. Nothing is written. A failure names the change at fault.
 */
export async function planChangeset(changes: ParsedChange[], permissions: ReadonlySet<Permission>): Promise<Plan | ChangeFailure> {
  const plan = await new Planner(changes, permissions).plan();
  if ('status' in plan) return plan;
  return await unreadableFolders(plan) ?? plan;
}

/** Folders whose `.paloma.json` a plan writes. */
export async function foldersOf(plan: Plan): Promise<string[]> {
  const dirs = new Set<string>();
  const photoFolders = async (ids: number[]) => {
    const real = ids.filter((id) => Number.isInteger(id));
    for (const doc of await photoDocumentsById(real)) dirs.add(doc.folder.path);
  };
  for (const step of plan.steps) {
    switch (step.kind) {
      case 'photos':
        step.writes.forEach((write) => dirs.add(write.folderPath));
        // Album membership is stored in the photos' own folders
        await photoFolders([...step.albumAdds.values(), ...step.albumRemoves.values()].flat());
        break;
      case 'createAlbum':
        await photoFolders(step.photos);
        break;
      case 'updateAlbum':
      case 'deleteAlbum':
        if (!isRef(step.id)) (await albumFolders(step.id)).forEach((dir) => dirs.add(dir));
        break;
      case 'deletePerson':
        if (!isRef(step.id)) {
          const rows = await chunked([step.id], BATCH_SIZE, (chunk) => all(db.select({ photoId: photoPeople.photoId }).from(photoPeople).where(inArray(photoPeople.contactId, chunk))));
          await photoFolders(rows.map((row) => row.photoId));
        }
        break;
      default:
        break;
    }
  }
  return [...dirs].sort();
}

/** A 409 naming the unreadable sidecars among the folders the plan writes; null when all can be read. */
async function unreadableFolders(plan: Plan): Promise<ChangeFailure | null> {
  const dirs = await foldersOf(plan);
  const reads = await Promise.all(dirs.map((dir) => SidecarService.readFolderSidecar(dir)));
  const unreadable = dirs.filter((_, i) => reads[i].kind === 'unreadable');
  if (unreadable.length === 0) return null;
  const files = unreadable.map((dir) => SidecarService.getSidecarPath(dir));
  const result = failure(409, 'sidecar_unreadable', `Unreadable ${files.join(', ')}. Fix or remove the file to make changes there.`, { files: files.join(', ') });
  return { ...result, body: { ...result.body, failedFolders: unreadable } };
}
