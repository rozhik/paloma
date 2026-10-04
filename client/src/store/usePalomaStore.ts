import { create } from 'zustand';
import type { Photo, Folder } from '../../../shared/types.js';

export type AppView = 'library' | 'editor' | 'collage' | 'map' | 'people';
export type FilterType = 'all' | 'starred' | 'recent' | 'geotagged';

interface PalomaStore {
  currentView: AppView;
  selectedPhotos: Photo[];
  activeEditPhoto: Photo | null;
  searchQuery: string;
  selectedFolderId: number | null;
  selectedFilter: FilterType;
  selectedAlbumToken: string | null;
  /** Bumped after a change so the sidebar and the photo grid refetch without waiting for the poll */
  libraryVersion: number;

  setCurrentView: (view: AppView) => void;
  setActiveEditPhoto: (photo: Photo | null) => void;
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
  activeEditPhoto: null,
  searchQuery: '',
  selectedFolderId: null,
  selectedFilter: 'all',
  selectedAlbumToken: null,
  libraryVersion: 0,

  setCurrentView: (view) => set({ currentView: view }),
  setActiveEditPhoto: (photo) => set({ activeEditPhoto: photo, currentView: photo ? 'editor' : 'library' }),
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
