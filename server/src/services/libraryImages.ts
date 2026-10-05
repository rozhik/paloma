import { pluginRegistry } from '../plugins/index.js';
import type { FilterLookup } from './editChain.js';
import { parseEditsJson, photoImageUrls, type PhotoImageUrls } from './photoImages.js';

/** Filters of the plugins that are on right now. */
export const libraryLookup: FilterLookup = (name) => pluginRegistry.getFilter(name);

/** Thumbnail and preview URLs of a library photo, from its row in the `edits` table (if any). */
export function libraryImageUrls(photo: { id: number; fileHash: string }, editsJson: string | null | undefined): PhotoImageUrls {
  return photoImageUrls(photo, parseEditsJson(editsJson), libraryLookup);
}
