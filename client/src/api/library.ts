import type { FilterType } from '../store/usePalomaStore.js';

export interface LibrarySelection {
  selectedFolderId: number | null;
  selectedAlbumToken: string | null;
  selectedFilter: FilterType;
  searchQuery: string;
}

/** Query string of the current library selection, shared by the photo grid, the map and the places list. */
export function libraryQueryParams(selection: LibrarySelection, lang: string): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.selectedFolderId !== null) params.append('folderId', String(selection.selectedFolderId));
  if (selection.selectedAlbumToken !== null) params.append('album', selection.selectedAlbumToken);
  if (selection.selectedFilter === 'starred') params.append('starred', 'true');
  if (selection.selectedFilter === 'geotagged') params.append('geotagged', 'true');
  if (selection.searchQuery.trim()) params.append('query', selection.searchQuery.trim());
  params.append('lang', lang);
  return params;
}
