import { create } from 'zustand';
import type { Photo, Folder } from '../../../shared/types.js';

export type AppView = 'library' | 'editor' | 'collage' | 'map' | 'people';
export type FilterType = 'all' | 'starred' | 'recent';

interface PalomaStore {
  currentView: AppView;
  selectedPhotos: Photo[];
  activeEditPhoto: Photo | null;
  searchQuery: string;
  selectedFolderId: number | null;
  selectedFilter: FilterType;

  setCurrentView: (view: AppView) => void;
  setActiveEditPhoto: (photo: Photo | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedFolderId: (folderId: number | null) => void;
  setSelectedFilter: (filter: FilterType) => void;

  toggleSelectPhoto: (photo: Photo) => void;
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

  setCurrentView: (view) => set({ currentView: view }),
  setActiveEditPhoto: (photo) => set({ activeEditPhoto: photo, currentView: photo ? 'editor' : 'library' }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedFolderId: (selectedFolderId) => set({ selectedFolderId, selectedFilter: 'all' }),
  setSelectedFilter: (selectedFilter) => set({ selectedFilter, selectedFolderId: null }),

  toggleSelectPhoto: (photo) => {
    const { selectedPhotos } = get();
    const exists = selectedPhotos.some((p) => p.id === photo.id);
    if (exists) {
      set({ selectedPhotos: selectedPhotos.filter((p) => p.id !== photo.id) });
    } else {
      set({ selectedPhotos: [...selectedPhotos, photo] });
    }
  },

  removePhotoFromTray: (photoId) => {
    set({ selectedPhotos: get().selectedPhotos.filter((p) => p.id !== photoId) });
  },

  clearTray: () => set({ selectedPhotos: [] }),

  isPhotoSelected: (photoId) => {
    return get().selectedPhotos.some((p) => p.id === photoId);
  },
}));
