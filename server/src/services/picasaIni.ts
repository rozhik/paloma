import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { EditStep, Geotag, PalomaFace, PalomaPerson } from '../../../shared/types.js';
import { isGeotag, roundGeotag } from './location.js';
import { parseFilters, parseRect64 } from './picasaFilters.js';

/** Photo fields Paloma takes from a Picasa .ini file section (and stores in .paloma.json). */
export interface PhotoFields {
  star?: true;
  hidden?: true;
  caption?: string;
  keywords?: string[];
  /** Album tokens, without duplicates */
  albums?: string[];
  /** Faces of contacts, or ignored faces; from Picasa `faces=` */
  faces?: PalomaFace[];
  /** Location in decimal degrees; null (sidecar only) means the location was removed */
  geotag?: Geotag | null;
  /** Edit chain; from Picasa `filters=`, which is also the photo's edit history */
  edits?: EditStep[];
}

/** The keys of a Picasa `[.album:<token>]` section that Paloma maps; values are kept verbatim. */
export type IniAlbum = {
  name?: string;
  date?: string;
  location?: string;
  description?: string;
};

export const ALBUM_KEYS = ['name', 'date', 'location', 'description'] as const;

export interface PicasaIniData {
  /** Supported fields of each file section that has any */
  sections: Record<string, PhotoFields>;
  /** Album definitions keyed by token */
  albums: Record<string, IniAlbum>;
  /** People from `[Contacts2]`, keyed by contact id (16 lowercase hex digits) */
  people: Record<string, PalomaPerson>;
}

export type PicasaIniRead =
  | { kind: 'missing' }
  | ({ kind: 'ok'; fileName: string; sha256: string } & PicasaIniData);

const ALBUM_PREFIX = '.album:';

// Sections that describe the folder, albums or contacts rather than a file
const NON_FILE_SECTIONS = new Set(['Picasa', 'Contacts', 'Contacts2', 'encoding', 'photoid', '(null)']);

/** Name of the folder's Picasa file: `.picasa.ini` before `picasa.ini`, any case, exact lowercase first. */
export function findPicasaIni(names: readonly string[]): string | undefined {
  const rank = (name: string): number => {
    const lower = name.toLowerCase();
    if (lower === '.picasa.ini') return name === lower ? 0 : 1;
    if (lower === 'picasa.ini') return name === lower ? 2 : 3;
    return -1;
  };
  return names
    .filter((name) => rank(name) >= 0)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0];
}

function decode(bytes: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Older Picasa installs on Cyrillic Windows wrote the ANSI code page
    text = new TextDecoder('windows-1251').decode(bytes);
  }
  return text.startsWith('﻿') ? text.slice(1) : text;
}

const CONTACT_ID = /^[0-9a-f]{1,16}$/i;
const IGNORED_CONTACT = 'ffffffffffffffff';
const CONTACTS_SECTION = 'Contacts2';

/** A Picasa contact id (`%I64x`, leading zeros may be missing) as 16 lowercase hex digits. */
export function normalizeContactId(id: string): string | undefined {
  return CONTACT_ID.test(id) ? id.toLowerCase().padStart(16, '0') : undefined;
}

/** Picasa `faces=rect64(<hex>),<contactId>;…`; items that cannot be read are dropped. */
export function parseFaces(value: string | undefined): PalomaFace[] {
  const faces: PalomaFace[] = [];
  for (const item of value?.split(';') ?? []) {
    const match = /^rect64\(([^)]*)\),(.*)$/.exec(item);
    const rect = match && parseRect64(match[1]);
    const person = match && normalizeContactId(match[2]);
    if (!rect || !person) continue;
    faces.push(person === IGNORED_CONTACT ? { rect, ignored: true } : { rect, person });
  }
  return faces;
}

/** A `[Contacts2]` line `<name>;<email>;<googleId>`; undefined unless it has exactly three parts. */
function parseContact(value: string): PalomaPerson | undefined {
  const parts = value.split(';');
  if (parts.length !== 3) return undefined;
  const [name, email, googleId] = parts.map((part) => (part === '' ? null : part));
  return { name, email, googleId };
}

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** Picasa's `geotag=lat,lon` in decimal degrees; undefined unless it is exactly two numbers in range. */
export function parseGeotag(value: string | undefined): Geotag | undefined {
  const parts = value?.split(',').map((part) => part.trim());
  if (parts?.length !== 2 || !parts.every((part) => DECIMAL.test(part))) return undefined;
  const geotag = { lat: Number(parts[0]), lon: Number(parts[1]) };
  return isGeotag(geotag) ? roundGeotag(geotag) : undefined;
}

function toFields(entries: Map<string, string>): PhotoFields {
  const fields: PhotoFields = {};
  if (entries.get('star') === 'yes') fields.star = true;
  if (entries.get('hidden') === 'yes') fields.hidden = true;
  const caption = entries.get('caption');
  if (caption) fields.caption = caption;
  const keywords = entries.get('keywords')?.split(',').filter((keyword) => keyword !== '');
  if (keywords?.length) fields.keywords = keywords;
  const albums = [...new Set(entries.get('albums')?.split(',').filter((token) => token !== ''))];
  if (albums.length) fields.albums = albums;
  const faces = parseFaces(entries.get('faces'));
  if (faces.length) fields.faces = faces;
  const geotag = parseGeotag(entries.get('geotag'));
  if (geotag) fields.geotag = geotag;
  const edits = parseFilters(entries.get('filters'));
  if (edits.length) fields.edits = edits;
  return fields;
}

function toAlbum(entries: Map<string, string>): IniAlbum {
  const album: IniAlbum = {};
  for (const key of ALBUM_KEYS) {
    const value = entries.get(key);
    if (value !== undefined) album[key] = value;
  }
  return album;
}

/** Parses Picasa .ini bytes into file-section fields and album definitions; values are never trimmed. */
export function parsePicasaIni(bytes: Buffer): PicasaIniData {
  const text = decode(bytes);
  const lines = text.includes('\r\n') ? text.split('\r\n') : text.split('\n');

  const raw = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of lines) {
    if (line === '') continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.slice(1, -1);
      // A repeated section is ignored, as Windows INI readers do
      current = raw.has(name) ? undefined : new Map();
      if (current) raw.set(name, current);
      continue;
    }
    const eq = line.indexOf('=');
    if (!current || eq <= 0) continue;
    const key = line.slice(0, eq);
    if (!current.has(key)) current.set(key, line.slice(eq + 1));
  }

  const sections: Record<string, PhotoFields> = {};
  const albums: Record<string, IniAlbum> = {};
  const people: Record<string, PalomaPerson> = {};
  for (const [name, entries] of raw) {
    if (name === CONTACTS_SECTION) {
      for (const [id, value] of entries) {
        const contactId = normalizeContactId(id);
        const person = parseContact(value);
        if (contactId && person) people[contactId] ??= person;
      }
      continue;
    }
    if (name.startsWith(ALBUM_PREFIX)) {
      const token = name.slice(ALBUM_PREFIX.length);
      if (token !== '') albums[token] = toAlbum(entries);
      continue;
    }
    if (NON_FILE_SECTIONS.has(name)) continue;
    const fields = toFields(entries);
    if (Object.keys(fields).length > 0) sections[name] = fields;
  }
  return { sections, albums, people };
}

/** Reads the folder's Picasa .ini, if any. Paloma never writes these files. */
export async function readPicasaIni(dir: string, names?: readonly string[]): Promise<PicasaIniRead> {
  let fileName: string | undefined;
  try {
    fileName = findPicasaIni(names ?? await fs.promises.readdir(dir));
  } catch {
    return { kind: 'missing' };
  }
  if (!fileName) return { kind: 'missing' };

  let bytes: Buffer;
  try {
    bytes = await fs.promises.readFile(path.join(dir, fileName));
  } catch {
    return { kind: 'missing' };
  }
  return {
    kind: 'ok',
    fileName,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    ...parsePicasaIni(bytes),
  };
}
