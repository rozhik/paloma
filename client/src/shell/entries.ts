import { BookImage, Clock, Folder, History, Image, MapPin, Star, Tag, User, type LucideIcon } from 'lucide-react';
import { usePalomaStore, type FilterType, type MemorySelection } from '../store/usePalomaStore.js';
import type { LibrarySelection } from '../api/library.js';
import { allows } from '../levels/controls.js';
import type { Level } from '../levels/levels.js';

/** Something the library can show the photos of: a shortcut, memory, album, tag, person or folder. */
export type LibraryEntry =
  | { kind: 'shortcut'; filter: FilterType }
  | { kind: 'memory'; memory: MemorySelection }
  | { kind: 'album'; token: string }
  | { kind: 'tag'; name: string }
  | { kind: 'person'; id: string }
  | { kind: 'folder'; id: number };

export type EntryKind = LibraryEntry['kind'];

const SHORTCUT_ICONS: Record<FilterType, { icon: LucideIcon; iconClass: string }> = {
  all: { icon: Image, iconClass: 'text-primary' },
  starred: { icon: Star, iconClass: 'text-warning' },
  recent: { icon: Clock, iconClass: 'text-info' },
  geotagged: { icon: MapPin, iconClass: 'text-danger' },
};

const KIND_ICONS: Record<Exclude<EntryKind, 'shortcut'>, { icon: LucideIcon; iconClass: string }> = {
  memory: { icon: History, iconClass: 'text-secondary' },
  album: { icon: BookImage, iconClass: 'text-primary' },
  tag: { icon: Tag, iconClass: 'text-info' },
  person: { icon: User, iconClass: 'text-success' },
  folder: { icon: Folder, iconClass: 'text-warning' },
};

/** The entry's sidebar icon and its color class; the same wherever the entry is named. */
export const entryIcon = (entry: LibraryEntry): { icon: LucideIcon; iconClass: string } =>
  entry.kind === 'shortcut' ? SHORTCUT_ICONS[entry.filter] : KIND_ICONS[entry.kind];

/** Whether the level lets the user open entries of this kind: their sidebar list, and for people choosing one. */
export function entryListAllowed(level: Level, kind: EntryKind): boolean {
  switch (kind) {
    case 'shortcut': return allows(level, 'sidebar.shortcuts');
    case 'memory': return allows(level, 'sidebar.memories');
    case 'album': return allows(level, 'sidebar.albums');
    case 'tag': return allows(level, 'sidebar.tags');
    case 'person': return allows(level, 'sidebar.people') && allows(level, 'people.choose');
    case 'folder': return allows(level, 'sidebar.folders');
  }
}

/** The library selection that shows exactly the entry's photos, without search text. */
export function entrySelection(entry: LibraryEntry): LibrarySelection {
  return {
    selectedFolderId: entry.kind === 'folder' ? entry.id : null,
    selectedAlbumToken: entry.kind === 'album' ? entry.token : null,
    selectedTag: entry.kind === 'tag' ? entry.name : null,
    selectedPerson: entry.kind === 'person' ? entry.id : null,
    selectedMemory: entry.kind === 'memory' ? entry.memory : null,
    selectedFilter: entry.kind === 'shortcut' ? entry.filter : 'all',
    searchQuery: '',
  };
}

/** Opens the entry in the library, as choosing it in the sidebar does. */
export function openEntry(entry: LibraryEntry): void {
  const store = usePalomaStore.getState();
  switch (entry.kind) {
    case 'shortcut': store.setSelectedFilter(entry.filter); break;
    case 'memory': store.setSelectedMemory(entry.memory); break;
    case 'album': store.setSelectedAlbum(entry.token); break;
    case 'tag': store.setSelectedTag(entry.name); break;
    case 'person': store.setSelectedPerson(entry.id); break;
    case 'folder': store.setSelectedFolderId(entry.id); break;
  }
}
