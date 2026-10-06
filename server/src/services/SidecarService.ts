import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  EditStep, Geotag, PalomaAlbumDefinition, PalomaFace, PalomaFolderFile, PalomaPerson, PalomaPhotoEntry,
} from '../../../shared/types.js';
import { ALBUM_KEYS, readPicasaIni, type IniAlbum, type PhotoFields, type PicasaIniRead } from './picasaIni.js';
import { isGeotag, roundGeotag } from './location.js';
import { isEditChain } from './editChain.js';
import { uniqueKeywords } from './embeddedText.js';

export type { PhotoFields } from './picasaIni.js';

export const SIDECAR_NAME = '.paloma.json';

export type SidecarRead =
  | { kind: 'missing' }
  | { kind: 'ok'; data: PalomaFolderFile }
  | { kind: 'unreadable'; reason: string };

/**
 * What a folder's files say: photo fields keyed by file name (photos without fields are absent), album
 * definitions keyed by token and people keyed by contact id.
 */
export interface FolderState {
  photos: Record<string, PhotoFields>;
  albums: Record<string, PalomaAlbumDefinition>;
  people: Record<string, PalomaPerson>;
}

const EMPTY_STATE: FolderState = { photos: {}, albums: {}, people: {} };

/** A change to a photo's fields. `false`, `''` and `[]` clear the field. */
export interface FieldPatch {
  star?: boolean;
  hidden?: boolean;
  caption?: string;
  keywords?: string[];
  /** The photo file has an embedded description: clearing the caption stores `""` instead of removing the key */
  captionEmbedded?: boolean;
  /** The photo file has embedded tags: clearing the keywords stores `[]` instead of removing the key */
  keywordsEmbedded?: boolean;
  /** An object sets the location, `null` stores that it was removed, `false` deletes the key */
  geotag?: Geotag | null | false;
  /** The whole edit chain; `[]` removes the edits */
  edits?: EditStep[];
}

export class SidecarUnreadableError extends Error {
  constructor(public readonly filePath: string, reason: string) {
    super(`Unreadable ${filePath}: ${reason}`);
    this.name = 'SidecarUnreadableError';
  }
}

/** Fields mapped from the Picasa .ini, which a re-import replaces in unmodified entries; `edits` comes from `filters=`. */
const SUPPORTED_FIELDS = ['star', 'hidden', 'caption', 'keywords', 'albums', 'faces', 'geotag', 'edits'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectOfObjects(value: unknown): boolean {
  return isPlainObject(value) && Object.values(value).every(isPlainObject);
}

/** Non-empty strings of an array, without duplicates; undefined for anything else or when none remain. */
function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = [...new Set(value.filter((item): item is string => typeof item === 'string' && item !== ''))];
  return list.length > 0 ? list : undefined;
}

const CONTACT_ID = /^[0-9a-f]{16}$/;

const isFraction = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1;

function isFace(value: unknown): value is PalomaFace {
  if (!isPlainObject(value) || !isPlainObject(value.rect)) return false;
  const { left, top, right, bottom } = value.rect;
  if (![left, top, right, bottom].every(isFraction)) return false;
  if (value.ignored === true) return value.person === undefined;
  return typeof value.person === 'string' && CONTACT_ID.test(value.person) && value.ignored === undefined;
}

/** The valid faces of an entry's `faces`; undefined when it is not an array or none is valid. */
function facesOf(value: unknown): PalomaFace[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const faces = value.filter(isFace).map((face) => structuredClone(face));
  return faces.length > 0 ? faces : undefined;
}

const isNullableString = (value: unknown) => value === null || typeof value === 'string';

/** The valid person definitions of a sidecar's `people`; anything else is ignored, never a reason to reject the file. */
export function peopleOf(value: unknown): Record<string, PalomaPerson> {
  const people: Record<string, PalomaPerson> = {};
  if (!isPlainObject(value)) return people;
  for (const [id, person] of Object.entries(value)) {
    if (!CONTACT_ID.test(id) || !isPlainObject(person)) continue;
    const { name = null, email = null, googleId = null } = person;
    if (![name, email, googleId].every(isNullableString)) continue;
    people[id] = { name, email, googleId } as PalomaPerson;
  }
  return people;
}

function listDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function sameFields(a: PhotoFields, b: PhotoFields): boolean {
  return a.star === b.star
    && a.hidden === b.hidden
    && a.caption === b.caption
    && JSON.stringify(a.keywords ?? []) === JSON.stringify(b.keywords ?? [])
    && JSON.stringify(a.albums ?? []) === JSON.stringify(b.albums ?? [])
    && JSON.stringify(a.faces ?? []) === JSON.stringify(b.faces ?? [])
    && sameGeotag(a.geotag, b.geotag)
    && JSON.stringify(a.edits ?? []) === JSON.stringify(b.edits ?? []);
}

function sameGeotag(a: Geotag | null | undefined, b: Geotag | null | undefined): boolean {
  if (a === undefined || a === null || b === undefined || b === null) return a === b;
  return a.lat === b.lat && a.lon === b.lon;
}

function sortNames(names: string[]): string[] {
  return names.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }) || (a < b ? -1 : a > b ? 1 : 0));
}

export class SidecarService {
  public static getSidecarPath(folderPath: string): string {
    return path.join(folderPath, SIDECAR_NAME);
  }

  /** Reads `.paloma.json`. Anything that is not a well-formed v2 file is `unreadable` and must not be overwritten. */
  public static readFolderSidecar(dir: string): SidecarRead {
    let text: string;
    try {
      text = fs.readFileSync(this.getSidecarPath(dir), 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
      return { kind: 'unreadable', reason: (err as Error).message };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.startsWith('﻿') ? text.slice(1) : text);
    } catch (err) {
      return { kind: 'unreadable', reason: `invalid JSON (${(err as Error).message})` };
    }
    if (!isPlainObject(parsed)) return { kind: 'unreadable', reason: 'not a JSON object' };
    if (parsed.format !== 'paloma-folder') return { kind: 'unreadable', reason: `unknown format ${JSON.stringify(parsed.format)}` };
    if (parsed.version !== 2) return { kind: 'unreadable', reason: `unsupported version ${JSON.stringify(parsed.version)}` };
    if (parsed.iniHash !== undefined && typeof parsed.iniHash !== 'string') {
      return { kind: 'unreadable', reason: 'iniHash is not a string' };
    }
    if (parsed.photos === undefined) parsed.photos = {};
    if (!isObjectOfObjects(parsed.photos)) {
      return { kind: 'unreadable', reason: 'photos is not an object of objects' };
    }
    if (parsed.albums !== undefined && !isObjectOfObjects(parsed.albums)) {
      return { kind: 'unreadable', reason: 'albums is not an object of objects' };
    }
    return { kind: 'ok', data: parsed as PalomaFolderFile };
  }

  /** The fields of an entry as the library sees them; values of the wrong type count as absent. */
  public static fieldsOf(entry: PalomaPhotoEntry | undefined): PhotoFields {
    const fields: PhotoFields = {};
    if (!entry) return fields;
    if (entry.star === true) fields.star = true;
    if (entry.hidden === true) fields.hidden = true;
    // "" and [] are kept: they say that the text embedded in the photo file was removed
    if (typeof entry.caption === 'string') fields.caption = entry.caption;
    if (Array.isArray(entry.keywords)) {
      fields.keywords = entry.keywords.filter((k): k is string => typeof k === 'string' && k !== '');
    }
    const albums = stringList(entry.albums);
    if (albums) fields.albums = albums;
    const faces = facesOf(entry.faces);
    if (faces) fields.faces = faces;
    if (entry.geotag === null) fields.geotag = null;
    else if (isGeotag(entry.geotag)) fields.geotag = { lat: entry.geotag.lat, lon: entry.geotag.lon };
    if (isEditChain(entry.edits) && entry.edits.length > 0) fields.edits = structuredClone(entry.edits);
    return fields;
  }

  /**
   * Keys Picasa sections by the matching file on disk: exact name first, then ignoring case.
   * Sections without a file keep their own name. When two sections land on one key, the first wins.
   */
  public static matchSections(sections: Record<string, PhotoFields>, names: readonly string[]): Record<string, PhotoFields> {
    const exact = new Set(names);
    const byLower = new Map<string, string>();
    for (const name of sortNames([...names])) {
      if (!byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
    }

    const matched: Record<string, PhotoFields> = {};
    for (const [section, fields] of Object.entries(sections)) {
      const key = exact.has(section) ? section : byLower.get(section.toLowerCase()) ?? section;
      if (key in matched) {
        console.warn(`Picasa section [${section}] matches ${key} again; keeping the first section`);
        continue;
      }
      matched[key] = fields;
    }
    return matched;
  }

  /**
   * Applies a changed Picasa .ini to a sidecar: entries without `modified` follow the .ini, entries changed
   * in Paloma keep their values (a differing .ini value is logged as a conflict). Returns a new object.
   */
  public static reimport(
    data: PalomaFolderFile,
    imported: Record<string, PhotoFields>,
    iniHash: string,
    dir = '',
    iniAlbums: Record<string, IniAlbum> = {},
    iniPeople: Record<string, PalomaPerson> = {},
  ): PalomaFolderFile {
    const photos: Record<string, PalomaPhotoEntry> = {};
    for (const [name, entry] of Object.entries(data.photos)) {
      const fromIni = imported[name] ?? {};
      if (entry.modified !== undefined) {
        if (!sameFields(this.fieldsOf(entry), fromIni)) {
          console.warn(`Conflict: ${path.join(dir, name)} changed in Paloma and in the Picasa .ini; keeping the Paloma value`);
        }
        photos[name] = entry;
        continue;
      }
      const next: PalomaPhotoEntry = { ...entry };
      for (const field of SUPPORTED_FIELDS) delete next[field];
      Object.assign(next, fromIni);
      if (Object.keys(next).length > 0) photos[name] = next;
    }
    for (const [name, fields] of Object.entries(imported)) {
      if (!(name in data.photos)) photos[name] = { ...fields };
    }

    let result: PalomaFolderFile = { ...data, iniHash, photos };

    // Definitions changed in Paloma are kept; definitions missing from the .ini are never removed
    if (data.albums !== undefined || Object.keys(iniAlbums).length > 0) {
      const albums: Record<string, PalomaAlbumDefinition> = { ...data.albums };
      for (const [token, fromIni] of Object.entries(iniAlbums)) {
        const current = albums[token];
        if (typeof current?.modified === 'string') continue;
        const next: PalomaAlbumDefinition = { ...current };
        for (const key of ALBUM_KEYS) delete next[key];
        albums[token] = Object.assign(next, fromIni);
      }
      result = { ...result, albums };
    }

    // People listed in the .ini replace their definitions; people are never removed
    if (Object.keys(iniPeople).length > 0) {
      const current = isPlainObject(data.people) ? data.people : {};
      result = { ...result, people: { ...current, ...structuredClone(iniPeople) } };
    }
    return result;
  }

  /** Serializes with sorted photo keys, 2-space indent and a trailing LF, keeping other keys in their order. */
  public static serialize(data: PalomaFolderFile): string {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'photos') {
        out[key] = value;
        continue;
      }
      const photos: Record<string, PalomaPhotoEntry> = {};
      for (const name of sortNames(Object.keys(data.photos))) photos[name] = data.photos[name];
      out.photos = photos;
    }
    return `${JSON.stringify(out, null, 2)}\n`;
  }

  /** Replaces `.paloma.json` atomically via a temp file in the same folder. */
  public static writeFolderSidecar(dir: string, data: PalomaFolderFile): void {
    const tmp = path.join(dir, `${SIDECAR_NAME}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
      fs.writeFileSync(tmp, this.serialize(data), 'utf-8');
      fs.renameSync(tmp, this.getSidecarPath(dir));
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
  }

  /** Re-imports the Picasa .ini into a readable sidecar when its hash differs from `iniHash`. */
  private static reconcileIni(dir: string, data: PalomaFolderFile, names: readonly string[]): PalomaFolderFile | null {
    if (data.iniHash === undefined) return null;
    const ini = readPicasaIni(dir, names);
    if (ini.kind !== 'ok' || ini.sha256 === data.iniHash) return null;
    return this.reimport(data, this.matchSections(ini.sections, names), ini.sha256, dir, ini.albums, ini.people);
  }

  /** A new sidecar holding a snapshot of the folder's Picasa .ini, or an empty one without an .ini. */
  private static importIni(ini: PicasaIniRead, names: readonly string[]): PalomaFolderFile {
    if (ini.kind !== 'ok') return { format: 'paloma-folder', version: 2, photos: {} };
    const albums = Object.fromEntries(Object.entries(ini.albums).map(([token, album]) => [token, { ...album }]));
    return {
      format: 'paloma-folder',
      version: 2,
      iniHash: ini.sha256,
      ...(Object.keys(albums).length > 0 ? { albums } : {}),
      ...(Object.keys(ini.people).length > 0 ? { people: structuredClone(ini.people) } : {}),
      photos: { ...this.matchSections(ini.sections, names) } as Record<string, PalomaPhotoEntry>,
    };
  }

  /**
   * The photo fields of a folder: from a readable `.paloma.json` (re-importing a changed Picasa .ini into it),
   * or live from the Picasa .ini when there is no sidecar. An unreadable sidecar yields no fields.
   */
  public static getFolderState(dir: string): FolderState {
    const names = listDir(dir);
    const sidecar = this.readFolderSidecar(dir);

    let photos: Record<string, PalomaPhotoEntry | PhotoFields>;
    let albums: Record<string, PalomaAlbumDefinition>;
    let people: Record<string, PalomaPerson>;
    if (sidecar.kind === 'unreadable') {
      console.error(`Ignoring ${this.getSidecarPath(dir)}: ${sidecar.reason}`);
      return EMPTY_STATE;
    } else if (sidecar.kind === 'ok') {
      let data = sidecar.data;
      const reimported = this.reconcileIni(dir, data, names);
      if (reimported) {
        try {
          this.writeFolderSidecar(dir, reimported);
          data = reimported;
        } catch (err) {
          console.error(`Failed to re-import the Picasa .ini into ${this.getSidecarPath(dir)}:`, err);
        }
      }
      photos = data.photos;
      albums = data.albums ?? {};
      people = peopleOf(data.people);
    } else {
      const ini = readPicasaIni(dir, names);
      photos = ini.kind === 'ok' ? this.matchSections(ini.sections, names) : {};
      albums = ini.kind === 'ok' ? ini.albums : {};
      people = ini.kind === 'ok' ? ini.people : {};
    }

    const state: FolderState = { photos: {}, albums, people };
    for (const [name, entry] of Object.entries(photos)) {
      const fields = this.fieldsOf(entry as PalomaPhotoEntry);
      if (Object.keys(fields).length > 0) state.photos[name] = fields;
    }
    return state;
  }

  /**
   * Applies `mutate` to a folder's sidecar and writes the result atomically. The base is the readable
   * sidecar (re-importing a changed Picasa .ini first), else a snapshot of the Picasa .ini, else an empty file.
   * Throws SidecarUnreadableError if the existing sidecar is unreadable, or the write error.
   */
  public static updateFolderSidecar(dir: string, mutate: (data: PalomaFolderFile) => PalomaFolderFile): void {
    const names = listDir(dir);
    const sidecar = this.readFolderSidecar(dir);
    if (sidecar.kind === 'unreadable') throw new SidecarUnreadableError(this.getSidecarPath(dir), sidecar.reason);

    const data = sidecar.kind === 'ok'
      ? this.reconcileIni(dir, sidecar.data, names) ?? sidecar.data
      : this.importIni(readPicasaIni(dir, names), names);
    this.writeFolderSidecar(dir, mutate(data));
  }

  /**
   * Returns `data` with one photo entry changed by `edit` and marked `modified`. An entry left with only
   * `modified` is removed, unless a Picasa import could otherwise bring old values back.
   */
  public static changeEntry(
    data: PalomaFolderFile,
    filename: string,
    edit: (entry: PalomaPhotoEntry) => void,
    modified = new Date().toISOString(),
  ): PalomaFolderFile {
    const entry: PalomaPhotoEntry = { ...data.photos[filename] };
    edit(entry);
    entry.modified = modified;

    const photos = { ...data.photos };
    if (Object.keys(entry).length === 1 && data.iniHash === undefined) delete photos[filename];
    else photos[filename] = entry;
    return { ...data, photos };
  }

  /**
   * Saves a user change to one photo's fields. The first change in a folder imports its Picasa .ini.
   * Throws SidecarUnreadableError if the existing sidecar is unreadable, or the write error.
   */
  public static updatePhotoFields(dir: string, filename: string, patch: FieldPatch): void {
    this.updatePhotosFields(dir, { [filename]: patch });
  }

  /** Saves changes to several photos of one folder in a single atomic write, all with the same `modified`. */
  public static updatePhotosFields(dir: string, patches: Record<string, FieldPatch>): void {
    const modified = new Date().toISOString();
    this.updateFolderSidecar(dir, (data) => this.patchPhotos(data, patches, modified));
  }

  /** Returns `data` with field changes applied to several photo entries, each marked `modified`. */
  public static patchPhotos(data: PalomaFolderFile, patches: Record<string, FieldPatch>, modified: string): PalomaFolderFile {
    return Object.entries(patches).reduce(
      (next, [filename, patch]) => this.changeEntry(next, filename, (entry) => applyPatch(entry, patch), modified),
      data,
    );
  }
}

function applyPatch(entry: PalomaPhotoEntry, patch: FieldPatch): void {
  if (patch.star !== undefined) {
    if (patch.star) entry.star = true; else delete entry.star;
  }
  if (patch.hidden !== undefined) {
    if (patch.hidden) entry.hidden = true; else delete entry.hidden;
  }
  if (patch.caption !== undefined) {
    if (patch.caption !== '' || patch.captionEmbedded) entry.caption = patch.caption; else delete entry.caption;
  }
  if (patch.keywords !== undefined) {
    const keywords = uniqueKeywords(patch.keywords);
    if (keywords.length > 0 || patch.keywordsEmbedded) entry.keywords = keywords; else delete entry.keywords;
  }
  if (patch.geotag !== undefined) {
    if (patch.geotag === false) delete entry.geotag;
    else entry.geotag = patch.geotag && roundGeotag(patch.geotag);
  }
  if (patch.edits !== undefined) {
    if (patch.edits.length > 0) entry.edits = structuredClone(patch.edits); else delete entry.edits;
  }
}
