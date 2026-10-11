import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FolderOpen, MapPin, Search, X } from 'lucide-react';
import './glass.css';
import type { Photo } from '../../../../../shared/types.js';
import { describeError } from '../../../api/http.js';
import { useFormat } from '../../../i18n/format.js';
import { ViewerChrome, type ViewerChromeProps } from '../../../components/viewer/ViewerChrome.js';
import { IconButton } from '../../../shell/IconButton.js';
import { useNavigationItems } from '../../../shell/navigation.js';
import { useAllows } from '../../../levels/controls.js';
import { SidebarSection, useSidebarSections, type SidebarItem } from '../../../shell/sidebar.js';
import { EntryMenuButton } from '../../../shell/EntryMenuButton.js';
import { UserMenuButton } from '../../../shell/UserMenuButton.js';
import { SquarePhotoCard } from '../../../shell/SquarePhotoCard.js';
import { PHOTO_DRAG_TYPE, useTray } from '../../../shell/useTray.js';
import { VirtualGrid } from '../../../shell/VirtualGrid.js';
import { usePalomaStore } from '../../../store/usePalomaStore.js';
import type { AppShellProps, PhotoGridProps, SkinComponents, TrayHandlers } from '../types.js';
import { glass } from './index.js';

/** Height of the floating toolbar with its margin: content starts under it and scrolls beneath it */
const TOOLBAR_SPACE = 84;
/** Space the floating tray covers at the bottom, while it is shown */
const TRAY_SPACE = 100;

/** A floating capsule: folders, search, the views and the language. */
const GlassToolbar: React.FC<{ showFolders: boolean; foldersOpen: boolean; onFolders: () => void }> = ({ showFolders, foldersOpen, onFolders }) => {
  const { t } = useTranslation();
  const { searchQuery, setSearchQuery } = usePalomaStore();
  const items = useNavigationItems();
  const showSearch = useAllows('search');
  return (
    <header className="glass-toolbar glass-surface">
      {showFolders && (
        <IconButton
          icon={FolderOpen}
          label={t('sidebar.open')}
          iconSize={22}
          className="glass-btn"
          active={foldersOpen}
          aria-expanded={foldersOpen}
          aria-controls="glass-sidebar"
          onClick={onFolders}
        />
      )}
      {showSearch ? (
        <div className="glass-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            className="form-control"
            placeholder={t('nav.searchPlaceholder')}
            aria-label={t('nav.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex-grow-1" />
      )}
      <nav className="glass-views" aria-label={t('nav.views')}>
        {items.map(({ view, icon: Icon, label, active, select }) => (
          // The current view shows its name; the others are icons with a tooltip
          active ? (
            <button key={view} type="button" className="glass-btn glass-view active" aria-current="page" onClick={select}>
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ) : (
            <IconButton key={view} icon={Icon} label={label} iconSize={22} className="glass-btn" onClick={select} />
          )
        ))}
        <UserMenuButton className="ms-1" size={52} />
      </nav>
    </header>
  );
};

/** A list entry with room for a finger. */
const GlassEntry: React.FC<{ item: SidebarItem; onChosen: () => void }> = ({ item, onChosen }) => {
  const { formatNumber } = useFormat();
  const Icon = item.icon;
  return (
    <div className="glass-entry-row">
      <button
        type="button"
        className={`glass-entry ${item.active ? 'active' : ''}`}
        aria-current={item.active ? 'true' : undefined}
        title={item.title}
        onClick={() => {
          item.select();
          onChosen();
        }}
      >
        {item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt="" className="glass-entry-cover" />
          : <Icon size={22} className={item.active ? '' : item.iconClass} aria-hidden="true" />}
        <span dir="auto" className={`text-truncate flex-grow-1 ${item.placeholder ? 'fst-italic' : ''}`}>{item.label}</span>
        {item.count !== undefined && <span className="glass-count">{formatNumber(item.count)}</span>}
      </button>
      {/* Its menu and dialogs are drawn over the backdrop, so using them keeps the panel open */}
      {item.entry && <EntryMenuButton entry={item.entry} name={item.label} className="glass-btn glass-entry-menu" iconSize={22} />}
    </div>
  );
};

/** The sidebar as a floating panel over the grid; picking an entry or tapping outside closes it. */
export const GlassSidebar: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const sections = useSidebarSections();
  useEffect(() => {
    // Esc in an entry's open menu or dialog closes that, not the panel
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.entry-menu-items.show, .modal.show')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="glass-backdrop" onClick={onClose} aria-hidden="true" />
      <aside id="glass-sidebar" className="glass-sidebar glass-panel" aria-label={t('sidebar.open')}>
        <div className="d-flex justify-content-end">
          <IconButton icon={X} label={t('common.close')} iconSize={22} className="glass-btn" onClick={onClose} />
        </div>
        {sections.map((section) => (
          <SidebarSection
            key={section.id}
            section={section}
            className="glass-section"
            badge={section.count !== undefined && <span className="glass-count">{section.count}</span>}
          >
            {section.items.length === 0 && section.emptyText
              ? <p className="text-muted fst-italic px-2">{section.emptyText}</p>
              : section.items.map((item) => <GlassEntry key={item.key} item={item} onChosen={onClose} />)}
          </SidebarSection>
        ))}
      </aside>
    </>
  );
};

/** A floating capsule at the bottom: count, thumbnails and the actions as large icons. */
const GlassTray: React.FC<TrayHandlers> = (handlers) => {
  const { t } = useTranslation();
  const tray = useTray(handlers);
  if (tray.photos.length === 0) return null;
  return (
    <div className="glass-tray glass-surface">
      <span className="glass-tray-count">{t('common.photos', { count: tray.photos.length })}</span>
      {tray.singlePlace !== null && (
        <span className="glass-tray-place text-truncate" title={tray.singlePlace}>
          <MapPin size={16} aria-hidden="true" /> <span dir="auto">{tray.singlePlace}</span>
        </span>
      )}
      <div className="photo-tray-thumbnails glass-tray-thumbs">
        {tray.photos.map((photo) => (
          // Tapping a thumbnail takes the photo out of the tray
          <button
            key={photo.id}
            type="button"
            className="glass-tray-thumb"
            title={t('tray.removeFromTray')}
            aria-label={`${t('tray.removeFromTray')}: ${photo.filename}`}
            onClick={() => tray.removePhoto(photo.id)}
          >
            <img
              src={photo.thumbnailUrl}
              alt=""
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(PHOTO_DRAG_TYPE, String(photo.id));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            />
            <X size={14} className="glass-tray-thumb-x" aria-hidden="true" />
          </button>
        ))}
      </div>
      {tray.error != null && (
        <Alert variant="danger" className="position-absolute bottom-100 start-0 end-0 m-2" dismissible onClose={tray.clearError}>
          {describeError(tray.error, t)}
        </Alert>
      )}
      <div className="photo-tray-actions glass-tray-actions">
        {tray.actions.map(({ id, label, icon, run }) => (
          <IconButton key={id} icon={icon} label={label} iconSize={22} placement="top" className={`glass-btn glass-tray-${id}`} onClick={run} data-action={id} />
        ))}
      </div>
      {tray.dialogs}
    </div>
  );
};

/** Content runs edge to edge; toolbar, sidebar and tray float over it. */
const GlassShell: React.FC<AppShellProps> = ({ view, tray, children }) => {
  const [foldersOpen, setFoldersOpen] = useState(false);
  const closeFolders = useCallback(() => setFoldersOpen(false), []);
  // The library's grid scrolls under the floating bars; other views start below them
  return (
    <div className={`glass-shell glass-view-${view}`}>
      <main className="glass-content">{children}</main>
      <GlassToolbar showFolders={view === 'library'} foldersOpen={foldersOpen} onFolders={() => setFoldersOpen(!foldersOpen)} />
      {view === 'library' && foldersOpen && <GlassSidebar onClose={closeFolders} />}
      <GlassTray {...tray} />
    </div>
  );
};

const GlassGrid: React.FC<PhotoGridProps> = ({ photos, belowHeader, onStarToggle }) => {
  const trayShown = usePalomaStore((state) => state.selectedPhotos.length > 0);
  // A header sits below the toolbar, and the grid below the header
  const underToolbar = !belowHeader;
  const renderCard = useCallback(
    (photo: Photo, open: () => void) => <SquarePhotoCard className="glass-card" iconSize={20} photo={photo} onStarToggle={onStarToggle} onOpen={open} />,
    [onStarToggle],
  );
  return (
    <VirtualGrid
      className="glass-grid"
      photos={photos}
      columnWidth={glass.grid.columnWidth}
      captionHeight={glass.grid.captionHeight}
      gap={12}
      insetTop={underToolbar ? TOOLBAR_SPACE : 12}
      insetBottom={trayShown ? TRAY_SPACE : 16}
      renderCard={renderCard}
    />
  );
};

/** The viewer's bars as floating glass capsules, on the edges chosen in Settings. */
const GlassViewerChrome: React.FC<ViewerChromeProps> = (props) => <ViewerChrome {...props} className="glass-viewer" />;

export const components: SkinComponents = { AppShell: GlassShell, PhotoGrid: GlassGrid, ViewerChrome: GlassViewerChrome };
