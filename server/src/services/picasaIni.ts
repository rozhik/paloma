import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Photo fields Paloma takes from a Picasa .ini file section (and stores in .paloma.json). */
export interface PhotoFields {
  star?: true;
  hidden?: true;
  caption?: string;
  keywords?: string[];
}

export type PicasaIniRead =
  | { kind: 'missing' }
  | { kind: 'ok'; fileName: string; sha256: string; sections: Record<string, PhotoFields> };

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

function toFields(entries: Map<string, string>): PhotoFields {
  const fields: PhotoFields = {};
  if (entries.get('star') === 'yes') fields.star = true;
  if (entries.get('hidden') === 'yes') fields.hidden = true;
  const caption = entries.get('caption');
  if (caption) fields.caption = caption;
  const keywords = entries.get('keywords')?.split(',').filter((keyword) => keyword !== '');
  if (keywords?.length) fields.keywords = keywords;
  return fields;
}

/** Parses Picasa .ini bytes into the supported fields of each file section; values are never trimmed. */
export function parsePicasaIni(bytes: Buffer): Record<string, PhotoFields> {
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
  for (const [name, entries] of raw) {
    if (NON_FILE_SECTIONS.has(name) || name.startsWith('.album:')) continue;
    const fields = toFields(entries);
    if (Object.keys(fields).length > 0) sections[name] = fields;
  }
  return sections;
}

/** Reads the folder's Picasa .ini, if any. Paloma never writes these files. */
export function readPicasaIni(dir: string, names: readonly string[] = fs.readdirSync(dir)): PicasaIniRead {
  const fileName = findPicasaIni(names);
  if (!fileName) return { kind: 'missing' };

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(path.join(dir, fileName));
  } catch {
    return { kind: 'missing' };
  }
  return {
    kind: 'ok',
    fileName,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    sections: parsePicasaIni(bytes),
  };
}
