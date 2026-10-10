import type { Photo, PhotoStats } from '../../../shared/types.js';
import type { FilterType, MemorySelection } from '../store/usePalomaStore.js';
import { apiRequest } from './http.js';

export interface LibrarySelection {
  selectedFolderId: number | null;
  selectedAlbumToken: string | null;
  selectedTag: string | null;
  selectedPerson?: string | null;
  selectedMemory?: MemorySelection | null;
  selectedFilter: FilterType;
  searchQuery: string;
}

/** Query string of the current library selection, shared by the photo grid, the map and the places list. */
export function libraryQueryParams(selection: LibrarySelection, lang: string): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.selectedFolderId !== null) params.append('folderId', String(selection.selectedFolderId));
  if (selection.selectedAlbumToken !== null) params.append('album', selection.selectedAlbumToken);
  if (selection.selectedTag !== null) params.append('tag', selection.selectedTag);
  if (selection.selectedPerson) params.append('person', selection.selectedPerson);
  if (selection.selectedMemory) {
    params.append('takenFrom', selection.selectedMemory.from);
    params.append('takenTo', selection.selectedMemory.to);
  }
  if (selection.selectedFilter === 'starred') params.append('starred', 'true');
  if (selection.selectedFilter === 'geotagged') params.append('geotagged', 'true');
  if (selection.searchQuery.trim()) params.append('query', selection.searchQuery.trim());
  params.append('lang', lang);
  return params;
}

/** The photos of a selection, the same first page the grid shows. */
export const fetchSelectionPhotos = (selection: LibrarySelection, lang: string): Promise<Photo[]> =>
  apiRequest('GET', `/api/photos?${libraryQueryParams(selection, lang).toString()}`);

/** Totals over every photo of a selection, for an entry's Information. */
export const fetchPhotoStats = (selection: LibrarySelection, lang: string): Promise<PhotoStats> =>
  apiRequest('GET', `/api/photos/stats?${libraryQueryParams(selection, lang).toString()}`);
