import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PalomaFolderFile, PalomaPhotoEntry } from '../../../shared/types.js';
import { readPicasaIni, type PhotoFields } from './picasaIni.js';

export type { PhotoFields } from './picasaIni.js';

export const SIDECAR_NAME = '.paloma.json';

export type SidecarRead =
  | { kind: 'missing' }
  | { kind: 'ok'; data: PalomaFolderFile }
  | { kind: 'unreadable'; reason: string };

/** Effective photo fields of a folder, keyed by file name; photos without fields are absent. */
export type FolderState = Record<string, PhotoFields>;

/** A change to a photo's fields. `false`, `''` and `[]` clear the field. */
export interface FieldPatch {
  star?: boolean;
  hidden?: boolean;
  caption?: string;
  keywords?: string[];
}

export class SidecarUnreadableError extends Error {
  constructor(public readonly filePath: string, reason: string) {
    super(`Unreadable ${filePath}: ${reason}`);
    this.name = 'SidecarUnreadableError';
  }
}

const SUPPORTED_FIELDS = ['star', 'hidden', 'caption', 'keywords'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    && JSON.stringify(a.keywords ?? []) === JSON.stringify(b.keywords ?? []);
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
    if (!isPlainObject(parsed.photos) || !Object.values(parsed.photos).every(isPlainObject)) {
      return { kind: 'unreadable', reason: 'photos is not an object of objects' };
    }
    return { kind: 'ok', data: parsed as PalomaFolderFile };
  }

  /** The fields of an entry as the library sees them; values of the wrong type count as absent. */
  public static fieldsOf(entry: PalomaPhotoEntry | undefined): PhotoFields {
    const fields: PhotoFields = {};
    if (!entry) return fields;
    if (entry.star === true) fields.star = true;
    if (entry.hidden === true) fields.hidden = true;
    if (typeof entry.caption === 'string' && entry.caption !== '') fields.caption = entry.caption;
    if (Array.isArray(entry.keywords)) {
      const keywords = entry.keywords.filter((k): k is string => typeof k === 'string' && k !== '');
      if (keywords.length > 0) fields.keywords = keywords;
    }
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
    return { ...data, iniHash, photos };
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
    return this.reimport(data, this.matchSections(ini.sections, names), ini.sha256, dir);
  }

  /**
   * The photo fields of a folder: from a readable `.paloma.json` (re-importing a changed Picasa .ini into it),
   * or live from the Picasa .ini when there is no sidecar. An unreadable sidecar yields no fields.
   */
  public static getFolderState(dir: string): FolderState {
    const names = listDir(dir);
    const sidecar = this.readFolderSidecar(dir);

    let photos: Record<string, PalomaPhotoEntry | PhotoFields>;
    if (sidecar.kind === 'unreadable') {
      console.error(`Ignoring ${this.getSidecarPath(dir)}: ${sidecar.reason}`);
      return {};
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
    } else {
      const ini = readPicasaIni(dir, names);
      photos = ini.kind === 'ok' ? this.matchSections(ini.sections, names) : {};
    }

    const state: FolderState = {};
    for (const [name, entry] of Object.entries(photos)) {
      const fields = this.fieldsOf(entry as PalomaPhotoEntry);
      if (Object.keys(fields).length > 0) state[name] = fields;
    }
    return state;
  }

  /**
   * Saves a user change to one photo's fields. The first change in a folder imports its Picasa .ini.
   * Throws SidecarUnreadableError if the existing sidecar is unreadable, or the write error.
   */
  public static updatePhotoFields(dir: string, filename: string, patch: FieldPatch): void {
    const names = listDir(dir);
    const sidecar = this.readFolderSidecar(dir);
    if (sidecar.kind === 'unreadable') throw new SidecarUnreadableError(this.getSidecarPath(dir), sidecar.reason);

    let data: PalomaFolderFile;
    if (sidecar.kind === 'ok') {
      data = this.reconcileIni(dir, sidecar.data, names) ?? sidecar.data;
    } else {
      const ini = readPicasaIni(dir, names);
      data = ini.kind === 'ok'
        ? { format: 'paloma-folder', version: 2, iniHash: ini.sha256, photos: { ...this.matchSections(ini.sections, names) } as Record<string, PalomaPhotoEntry> }
        : { format: 'paloma-folder', version: 2, photos: {} };
    }

    const entry: PalomaPhotoEntry = { ...data.photos[filename] };
    if (patch.star !== undefined) {
      if (patch.star) entry.star = true; else delete entry.star;
    }
    if (patch.hidden !== undefined) {
      if (patch.hidden) entry.hidden = true; else delete entry.hidden;
    }
    if (patch.caption !== undefined) {
      if (patch.caption !== '') entry.caption = patch.caption; else delete entry.caption;
    }
    if (patch.keywords !== undefined) {
      if (patch.keywords.length > 0) entry.keywords = patch.keywords; else delete entry.keywords;
    }
    entry.modified = new Date().toISOString();

    const photos = { ...data.photos };
    // An entry with only `modified` is kept when a Picasa import could otherwise bring old values back
    if (Object.keys(entry).length === 1 && data.iniHash === undefined) delete photos[filename];
    else photos[filename] = entry;

    this.writeFolderSidecar(dir, { ...data, photos });
  }
}
