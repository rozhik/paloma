import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { BookImage, ChevronDown, Clock, Folder, Image, MapPin, Star, type LucideIcon } from 'lucide-react';
import { usePalomaStore, type FilterType } from '../store/usePalomaStore.js';
import { useUiSettings, type SidebarListId } from '../settings/uiSettings.js';
import { useFolderTree } from './useFolderTree.js';

/** One entry of a sidebar list: a shortcut, an album or a folder. */
export interface SidebarItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Utility class for the icon's color (e.g. `text-warning`) */
  iconClass: string;
  thumbnailUrl?: string | null;
  count?: number;
  /** Shown as a tooltip */
  title?: string;
  /** The label is a placeholder, like "Untitled" */
  placeholder?: boolean;
  active: boolean;
  select: () => void;
}

export interface SidebarSectionData {
  id: SidebarListId;
  title: string;
  /** Number of entries, shown next to the title */
  count?: number;
  /** Shown when the list has no entries */
  emptyText?: string;
  collapsed: boolean;
  toggle: () => void;
  items: SidebarItem[];
}

/** Collapses or expands a sidebar list; remembered, the same in every skin. Selection is not touched. */
export function toggleSidebarList(id: SidebarListId): void {
  const { collapsedSidebarLists, update } = useUiSettings.getState();
  update({
    collapsedSidebarLists: collapsedSidebarLists.includes(id)
      ? collapsedSidebarLists.filter((list) => list !== id)
      : [...collapsedSidebarLists, id],
  });
}

const SHORTCUTS: { filter: FilterType; icon: LucideIcon; iconClass: string; labelKey: 'sidebar.allPhotos' | 'sidebar.starred' | 'sidebar.recentImport' | 'sidebar.geotagged' }[] = [
  { filter: 'all', icon: Image, iconClass: 'text-primary', labelKey: 'sidebar.allPhotos' },
  { filter: 'starred', icon: Star, iconClass: 'text-warning', labelKey: 'sidebar.starred' },
  { filter: 'recent', icon: Clock, iconClass: 'text-info', labelKey: 'sidebar.recentImport' },
  { filter: 'geotagged', icon: MapPin, iconClass: 'text-danger', labelKey: 'sidebar.geotagged' },
];

/** The sidebar's lists (shortcuts, albums, folders) with their entries and collapsed state. */
export function useSidebarSections(): SidebarSectionData[] {
  const { t } = useTranslation();
  const {
    selectedFolderId, setSelectedFolderId, selectedFilter, setSelectedFilter, selectedAlbumToken, setSelectedAlbum,
  } = usePalomaStore();
  const collapsed = useUiSettings((state) => state.collapsedSidebarLists);
  const { folders, albums } = useFolderTree();
  const nothingSelected = selectedFolderId === null && selectedAlbumToken === null;

  const section = (id: SidebarListId, data: Omit<SidebarSectionData, 'id' | 'collapsed' | 'toggle'>): SidebarSectionData => ({
    id, collapsed: collapsed.includes(id), toggle: () => toggleSidebarList(id), ...data,
  });

  return [
    section('shortcuts', {
      title: t('sidebar.collections'),
      items: SHORTCUTS.map(({ filter, icon, iconClass, labelKey }) => ({
        key: filter,
        label: t(labelKey),
        icon,
        iconClass,
        // "All photos" is active only when no folder or album narrows it
        active: selectedFilter === filter && (filter !== 'all' || nothingSelected),
        select: () => setSelectedFilter(filter),
      })),
    }),
    section('albums', {
      title: t('sidebar.albums'),
      count: albums.length,
      emptyText: t('sidebar.noAlbums'),
      items: albums.map((album) => ({
        key: album.token,
        label: album.name ?? t('common.untitled'),
        placeholder: album.name === null,
        icon: BookImage,
        iconClass: 'text-primary',
        thumbnailUrl: album.coverThumbnailUrl,
        count: album.photoCount,
        title: album.description ?? undefined,
        active: selectedAlbumToken === album.token,
        select: () => setSelectedAlbum(album.token),
      })),
    }),
    section('folders', {
      title: t('sidebar.folders'),
      count: folders.length,
      emptyText: t('sidebar.noFolders'),
      items: folders.map((folder) => ({
        key: String(folder.id),
        label: folder.name,
        icon: Folder,
        iconClass: 'text-warning',
        count: folder.photoCount || 0,
        active: selectedFolderId === folder.id,
        select: () => setSelectedFolderId(folder.id),
      })),
    }),
  ];
}

interface SidebarSectionProps {
  section: SidebarSectionData;
  className?: string;
  /** Shown after the title, e.g. the number of entries */
  badge?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A collapsible sidebar list. The heading is a button that says whether the list is expanded; a collapsed
 * list keeps its heading and hides its entries. Every skin uses this, and styles it.
 */
export const SidebarSection: React.FC<SidebarSectionProps> = ({ section, className, badge, children }) => {
  const { t } = useTranslation();
  const bodyId = useId();
  return (
    <section className={`sidebar-section ${className ?? ''}`}>
      <h2 className="m-0 fs-6">
        <button
          type="button"
          className="sidebar-section-heading"
          aria-expanded={!section.collapsed}
          aria-controls={bodyId}
          title={section.collapsed ? t('sidebar.expandList') : t('sidebar.collapseList')}
          onClick={section.toggle}
        >
          <ChevronDown size={18} className="sidebar-section-chevron" aria-hidden="true" />
          <span className="sidebar-section-title">{section.title}</span>
          {badge}
        </button>
      </h2>
      <div id={bodyId} className="sidebar-section-body" hidden={section.collapsed}>
        {children}
      </div>
    </section>
  );
};
