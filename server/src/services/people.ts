import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { folderPeople, folders, photoPeople } from '../db/schema.js';
import type { PhotoPerson } from '../../../shared/types.js';

/**
 * Shown names of people by contact id: the first non-null name in folder path order, from readable sidecars
 * or, for folders without one, their Picasa .ini. Without `ids`, every person any folder defines.
 */
export function personNames(ids?: readonly string[]): Map<string, string | null> {
  const names = new Map<string, string | null>(ids?.map((id) => [id, null]));
  if (ids?.length === 0) return names;
  const rows = db.select({ contactId: folderPeople.contactId, name: folderPeople.name })
    .from(folderPeople)
    .innerJoin(folders, eq(folderPeople.folderId, folders.id))
    .where(ids ? inArray(folderPeople.contactId, [...ids]) : undefined)
    .orderBy(asc(folders.path))
    .all();
  for (const { contactId, name } of rows) {
    if (names.get(contactId) == null) names.set(contactId, name);
  }
  return names;
}

/** The people on a photo, in face order, with their shown names. */
export function peopleOnPhoto(photoId: number): PhotoPerson[] {
  const ids = db.select({ contactId: photoPeople.contactId })
    .from(photoPeople)
    .where(eq(photoPeople.photoId, photoId))
    .orderBy(asc(photoPeople.position))
    .all()
    .map((row) => row.contactId);
  const names = personNames(ids);
  return ids.map((id) => ({ id, name: names.get(id) ?? null }));
}
