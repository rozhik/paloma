import { create } from 'zustand';
import type { Photo, Folder } from '../../../shared/types.js';

export type AppView = 'library' | 'collage' | 'map' | 'people' | 'plugins' | 'settings';
/** The photo viewer: a snapshot of the grid's photos when it opened, and the one shown. */
export interface ViewerState {
  photos: Photo[];
  index: number;
  /** Set once a photo's edits were saved, so closing refreshes the grid's thumbnails */
  saved: boolean;
}

export type FilterType = 'all' | 'starred' | 'recent' | 'geotagged';

interface PalomaStore {
  currentView: AppView;
  selectedPhotos: Photo[];
  /** Open photo viewer, shown over the current view; null when closed */
  viewer: ViewerState | null;
  searchQuery: string;
  selectedFolderId: number | null;
  selectedFilter: FilterType;
  selectedAlbumToken: string | null;
  /** Bumped after a change so the sidebar and the photo grid refetch without waiting for the poll */
  libraryVersion: number;

  setCurrentView: (view: AppView) => void;
  /** Opens the viewer on `photos[index]`; `photos` is what the grid shows, in grid order */
  openViewer: (photos: Photo[], index: number) => void;
  /** Moves to the previous (-1) or next (+1) photo; stays put at either end */
  moveViewer: (delta: number) => void;
  /** Replaces a photo in the viewer's list with a fresh copy after its edits were saved */
  replaceViewerPhoto: (photo: Photo) => void;
  closeViewer: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedFolderId: (folderId: number | null) => void;
  setSelectedFilter: (filter: FilterType) => void;
  setSelectedAlbum: (token: string | null) => void;
  bumpLibrary: () => void;

  toggleSelectPhoto: (photo: Photo) => void;
  /** Adds photos to the selection, skipping those already selected */
  selectPhotos: (photos: Photo[]) => void;
  /** Replaces selected photos with fresh copies, e.g. after their location changed */
  refreshSelectedPhotos: (photos: Photo[]) => void;
  removePhotoFromTray: (photoId: number) => void;
  clearTray: () => void;
  isPhotoSelected: (photoId: number) => boolean;
}

export const usePalomaStore = create<PalomaStore>((set, get) => ({
  currentView: 'library',
  selectedPhotos: [],
  viewer: null,
  searchQuery: '',
  selectedFolderId: null,
  selectedFilter: 'all',
  selectedAlbumToken: null,
  libraryVersion: 0,

  setCurrentView: (view) => set({ currentView: view }),
  openViewer: (photos, index) => {
    if (photos.length === 0) return;
    set({ viewer: { photos, index: Math.min(Math.max(index, 0), photos.length - 1), saved: false } });
  },
  moveViewer: (delta) => {
    const { viewer } = get();
    if (!viewer) return;
    const index = Math.min(Math.max(viewer.index + delta, 0), viewer.photos.length - 1);
    if (index !== viewer.index) set({ viewer: { ...viewer, index } });
  },
  replaceViewerPhoto: (photo) => {
    const { viewer } = get();
    if (!viewer) return;
    set({ viewer: { ...viewer, saved: true, photos: viewer.photos.map((p) => (p.id === photo.id ? photo : p)) } });
  },
  closeViewer: () => {
    const { viewer, libraryVersion } = get();
    if (!viewer) return;
    set(viewer.saved ? { viewer: null, libraryVersion: libraryVersion + 1 } : { viewer: null });
  },
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedFolderId: (selectedFolderId) => set({ selectedFolderId, selectedFilter: 'all', selectedAlbumToken: null }),
  setSelectedFilter: (selectedFilter) => set({ selectedFilter, selectedFolderId: null, selectedAlbumToken: null }),
  setSelectedAlbum: (selectedAlbumToken) => set({ selectedAlbumToken, selectedFolderId: null, selectedFilter: 'all' }),
  bumpLibrary: () => set({ libraryVersion: get().libraryVersion + 1 }),

  toggleSelectPhoto: (photo) => {
    const { selectedPhotos } = get();
    const exists = selectedPhotos.some((p) => p.id === photo.id);
    if (exists) {
      set({ selectedPhotos: selectedPhotos.filter((p) => p.id !== photo.id) });
    } else {
      set({ selectedPhotos: [...selectedPhotos, photo] });
    }
  },

  selectPhotos: (photos) => {
    const { selectedPhotos } = get();
    const added = photos.filter((photo) => !selectedPhotos.some((p) => p.id === photo.id));
    if (added.length > 0) set({ selectedPhotos: [...selectedPhotos, ...added] });
  },

  refreshSelectedPhotos: (photos) => {
    const fresh = new Map(photos.map((photo) => [photo.id, photo]));
    set({ selectedPhotos: get().selectedPhotos.map((photo) => fresh.get(photo.id) ?? photo) });
  },

  removePhotoFromTray: (photoId) => {
    set({ selectedPhotos: get().selectedPhotos.filter((p) => p.id !== photoId) });
  },

  clearTray: () => set({ selectedPhotos: [] }),

  isPhotoSelected: (photoId) => {
    return get().selectedPhotos.some((p) => p.id === photoId);
  },
}));
