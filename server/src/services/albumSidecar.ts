import crypto from 'node:crypto';
import type { PalomaAlbumDefinition, PalomaFolderFile } from '../../../shared/types.js';
import { SidecarService } from './SidecarService.js';
import { ALBUM_KEYS } from './picasaIni.js';

// Pure album changes to one folder's sidecar. Each returns a new object; the caller writes it.

/** The album fields the library shows; `null` means absent. */
export type AlbumFields = Record<(typeof ALBUM_KEYS)[number], string | null>;

/** A new album token: 128 random bits as lowercase hex, like Picasa's. */
export function newAlbumToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Local time with its UTC offset, `YYYY-MM-DDTHH:mm:ss±HH:MM`, as Picasa writes album dates. */
export function localIsoWithOffset(date: Date): string {
  const pad = (n: number): string => String(Math.abs(n)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

function withAlbums(data: PalomaFolderFile, albums: Record<string, PalomaAlbumDefinition>): PalomaFolderFile {
  return { ...data, albums };
}

/** Sets the mapped fields exactly as given: a `null` or empty value removes the key. */
function setFields(definition: PalomaAlbumDefinition, fields: Partial<AlbumFields>): void {
  for (const key of ALBUM_KEYS) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (value === null || value === undefined || value === '') delete definition[key];
    else definition[key] = value;
  }
}

function addToken(data: PalomaFolderFile, token: string, filenames: readonly string[], modified: string): PalomaFolderFile {
  let next = data;
  for (const filename of filenames) {
    const current = SidecarService.fieldsOf(next.photos[filename]).albums ?? [];
    if (current.includes(token)) continue;
    next = SidecarService.changeEntry(next, filename, (entry) => {
      entry.albums = [...current, token];
    }, modified);
  }
  return next;
}

function dropToken(data: PalomaFolderFile, token: string, filenames: readonly string[], modified: string): PalomaFolderFile {
  let next = data;
  for (const filename of filenames) {
    const current = SidecarService.fieldsOf(next.photos[filename]).albums ?? [];
    if (!current.includes(token)) continue;
    next = SidecarService.changeEntry(next, filename, (entry) => {
      const rest = current.filter((t) => t !== token);
      if (rest.length > 0) entry.albums = rest; else delete entry.albums;
    }, modified);
  }
  return next;
}

/** Defines a new album in this folder and puts the given photos of this folder into it. */
export function createAlbum(
  data: PalomaFolderFile,
  token: string,
  fields: { name: string; date: string; description?: string; location?: string },
  filenames: readonly string[],
  modified: string,
): PalomaFolderFile {
  const definition: PalomaAlbumDefinition = {};
  setFields(definition, { name: fields.name, date: fields.date, description: fields.description, location: fields.location });
  definition.modified = modified;
  return addToken(withAlbums(data, { ...data.albums, [token]: definition }), token, filenames, modified);
}

/** Puts photos into an album, copying the shown definition (without `cover`) if this folder has none. */
export function addToAlbum(
  data: PalomaFolderFile,
  token: string,
  shown: PalomaAlbumDefinition,
  filenames: readonly string[],
  modified: string,
): PalomaFolderFile {
  let next = data;
  if (!next.albums?.[token]) {
    const { cover: _cover, ...copy } = shown;
    next = withAlbums(next, { ...next.albums, [token]: copy });
  }
  return addToken(next, token, filenames, modified);
}

export function removeFromAlbum(data: PalomaFolderFile, token: string, filenames: readonly string[], modified: string): PalomaFolderFile {
  return dropToken(data, token, filenames, modified);
}

/**
 * Writes the album's shown fields (with the user's changes applied) into this folder's copy, so all copies agree.
 * `cover` is the cover file name for this folder, `null` to remove it here, or `undefined` to leave it.
 */
export function editAlbum(
  data: PalomaFolderFile,
  token: string,
  shown: AlbumFields,
  cover: string | null | undefined,
  modified: string,
): PalomaFolderFile {
  const definition: PalomaAlbumDefinition = { ...data.albums?.[token] };
  setFields(definition, shown);
  if (cover === null) delete definition.cover;
  else if (cover !== undefined) definition.cover = cover;
  definition.modified = modified;
  return withAlbums(data, { ...data.albums, [token]: definition });
}

/** Removes the album's definition and its token from every entry, including entries for missing files. */
export function deleteAlbum(data: PalomaFolderFile, token: string, modified: string): PalomaFolderFile {
  const albums = { ...data.albums };
  delete albums[token];
  const next = data.albums ? withAlbums(data, albums) : data;
  return dropToken(next, token, Object.keys(next.photos), modified);
}
