import type { PalomaFace } from '../../../shared/types.js';
import { uniqueKeywords } from './embeddedText.js';
import type { PhotoFields } from './picasaIni.js';

/** A text as searched and compared: lowercased in JS, since SQLite folds only ASCII. */
export const textKey = (text: string): string => text.toLowerCase();

/** What the photo file itself says, as stored in the library. */
export interface FileText {
  filename: string;
  folderPath: string;
  embeddedCaption: string | null;
  embeddedKeywords: string[];
  cameraMake: string | null;
  cameraModel: string | null;
}

export interface EffectiveText {
  caption: string | null;
  keywords: string[];
  searchText: string;
}

/**
 * Description and tags as the library shows them: the folder files' values when they have the key
 * (`""` and `[]` meaning the embedded text was removed), else the text embedded in the photo file.
 */
export function effectiveText(fields: PhotoFields | undefined, file: FileText): EffectiveText {
  const caption = fields?.caption !== undefined ? fields.caption || null : file.embeddedCaption;
  const keywords = uniqueKeywords(fields?.keywords ?? file.embeddedKeywords);
  const searchText = textKey([file.filename, file.folderPath, caption, ...keywords, file.cameraMake, file.cameraModel]
    .filter((part): part is string => !!part)
    .join('\n'));
  return { caption, keywords, searchText };
}

/** Distinct contact ids of the faces that are not ignored, in face order. */
export function peopleOfFaces(faces: readonly PalomaFace[] | undefined): string[] {
  return [...new Set((faces ?? []).filter((face) => !face.ignored && face.person).map((face) => face.person!))];
}

/** A stored JSON list of strings; empty for null or anything malformed. */
export function parseKeywords(json: string | null): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
