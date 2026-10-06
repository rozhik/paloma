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

/** A running slideshow: the grid's photos when it started, and where it started. */
export interface SlideshowState {
  photos: Photo[];
  index: number;
}

export type FilterType = 'all' | 'starred' | 'recent' | 'geotagged';

/** What the grid of a person shows: their photos, or detected faces that look like them. */
export type PersonMode = 'photos' | 'similar';

interface PalomaStore {
  currentView: AppView;
  selectedPhotos: Photo[];
  /** Open photo viewer, shown over the current view; null when closed */
  viewer: ViewerState | null;
  /** Running slideshow, shown over everything; null when there is none */
  slideshow: SlideshowState | null;
  searchQuery: string;
  selectedFolderId: number | null;
  selectedFilter: FilterType;
  selectedAlbumToken: string | null;
  /** Tag whose photos the library shows; null when no tag is chosen */
  selectedTag: string | null;
  /** Contact id of the person whose photos the library shows; null when no person is chosen */
  selectedPerson: string | null;
  /** The library shows the detected faces that belong to no person */
  selectedUnrecognized: boolean;
  personMode: PersonMode;
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
  /** Starts a slideshow of `photos` (the grid's, in grid order) at `photos[index]` */
  startSlideshow: (photos: Photo[], index: number) => void;
  stopSlideshow: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedFolderId: (folderId: number | null) => void;
  setSelectedFilter: (filter: FilterType) => void;
  setSelectedAlbum: (token: string | null) => void;
  /** Shows the photos of a tag, replacing a chosen folder, album or collection */
  setSelectedTag: (tag: string | null) => void;
  /** Shows the photos of a person, replacing a chosen folder, album, tag or collection */
  setSelectedPerson: (person: string | null) => void;
  setPersonMode: (mode: PersonMode) => void;
  /** Shows the faces that belong to no person, replacing every other source */
  showUnrecognized: () => void;
  bumpLibrary: () => void;

  toggleSelectPhoto: (photo: Photo) => void;
  /** Adds photos to the selection, skipping those already selected */
  selectPhotos: (photos: Photo[]) => void;
  /** Replaces selected photos with fresh copies, e.g. after their location changed */
  refreshSelectedPhotos: (photos: Photo[]) => void;
  removePhotoFromTray: (photoId: number) => void;
  clearTray: () => void;
  /**
   * What switching to the Child level resets: the selection, search, folder, tag, person and shortcut, which Child cannot
   * see or change. An open album stays.
   */
  enterChildMode: () => void;
  isPhotoSelected: (photoId: number) => boolean;
}

/** Choosing where the library's photos come from clears every other source. */
const NO_SOURCE = {
  selectedFolderId: null, selectedFilter: 'all', selectedAlbumToken: null, selectedTag: null, selectedPerson: null, personMode: 'photos',
  selectedUnrecognized: false,
} as const;

export const usePalomaStore = create<PalomaStore>((set, get) => ({
  currentView: 'library',
  selectedPhotos: [],
  viewer: null,
  slideshow: null,
  searchQuery: '',
  selectedFolderId: null,
  selectedFilter: 'all',
  selectedAlbumToken: null,
  selectedTag: null,
  selectedPerson: null,
  personMode: 'photos',
  selectedUnrecognized: false,
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
  startSlideshow: (photos, index) => {
    if (photos.length === 0) return;
    set({ slideshow: { photos, index: Math.min(Math.max(index, 0), photos.length - 1) } });
  },
  stopSlideshow: () => set({ slideshow: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedFolderId: (selectedFolderId) => set({ ...NO_SOURCE, selectedFolderId }),
  setSelectedFilter: (selectedFilter) => set({ ...NO_SOURCE, selectedFilter }),
  setSelectedAlbum: (selectedAlbumToken) => set({ ...NO_SOURCE, selectedAlbumToken }),
  setSelectedTag: (selectedTag) => set({ ...NO_SOURCE, selectedTag }),
  setSelectedPerson: (selectedPerson) => set({ ...NO_SOURCE, selectedPerson }),
  setPersonMode: (personMode) => set({ personMode }),
  showUnrecognized: () => set({ ...NO_SOURCE, selectedUnrecognized: true }),
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

  enterChildMode: () => set({
    selectedPhotos: [], searchQuery: '', selectedFolderId: null, selectedFilter: 'all', selectedTag: null, selectedPerson: null,
    personMode: 'photos', selectedUnrecognized: false,
  }),

  isPhotoSelected: (photoId) => {
    return get().selectedPhotos.some((p) => p.id === photoId);
  },
}));
