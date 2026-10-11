import React, { useCallback } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { MapPin, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import './compact.css';
import type { Photo } from '../../../../../shared/types.js';
import { describeError } from '../../../api/http.js';
import { useFormat } from '../../../i18n/format.js';
import { ViewerChrome } from '../../../components/viewer/ViewerChrome.js';
import { IconButton } from '../../../shell/IconButton.js';
import { useNavigationItems } from '../../../shell/navigation.js';
import { useAllows } from '../../../levels/controls.js';
import { SidebarSection, useSidebarSections, type SidebarItem } from '../../../shell/sidebar.js';
import { EntryMenuButton } from '../../../shell/EntryMenuButton.js';
import { UserMenuButton } from '../../../shell/UserMenuButton.js';
import { PHOTO_DRAG_TYPE, useTray } from '../../../shell/useTray.js';
import { VirtualGrid } from '../../../shell/VirtualGrid.js';
import { SquarePhotoCard } from '../../../shell/SquarePhotoCard.js';
import { useUiSettings } from '../../../settings/uiSettings.js';
import { usePalomaStore } from '../../../store/usePalomaStore.js';
import type { ViewerChromeProps } from '../../../components/viewer/ViewerChrome.js';
import type { AppShellProps, PhotoGridProps, SkinComponents, TrayHandlers } from '../types.js';
import { compact } from './index.js';

/** One toolbar row: logo, search, the views as icons, the language. */
const CompactToolbar: React.FC = () => {
  const { t } = useTranslation();
  const { searchQuery, setSearchQuery, setCurrentView } = usePalomaStore();
  const items = useNavigationItems();
  const showSearch = useAllows('search');
  return (
    <header className="compact-toolbar">
      <button type="button" className="compact-logo" onClick={() => setCurrentView('library')}>
        🕊️ <span>Paloma</span>
      </button>
      {showSearch ? (
        <div className="compact-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            className="form-control form-control-sm"
            placeholder={t('nav.searchPlaceholder')}
            aria-label={t('nav.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex-grow-1" />
      )}
      <nav className="compact-views" aria-label={t('nav.views')}>
        {items.map(({ view, icon, label, active, select }) => (
          <IconButton
            key={view}
            icon={icon}
            label={label}
            active={active}
            aria-current={active ? 'page' : undefined}
            className="compact-icon-btn"
            onClick={select}
          />
        ))}
        <UserMenuButton className="ms-1" size={34} />
      </nav>
    </header>
  );
};

/** A list entry in one dense line, then the entry's menu. */
const CompactEntry: React.FC<{ item: SidebarItem }> = ({ item }) => {
  const { formatNumber } = useFormat();
  const Icon = item.icon;
  return (
    <div className="compact-entry-row">
      <button
        type="button"
        className={`compact-entry ${item.active ? 'active' : ''}`}
        aria-current={item.active ? 'true' : undefined}
        onClick={item.select}
        title={item.title ?? item.label}
      >
        <Icon size={15} className={item.active ? '' : item.iconClass} aria-hidden="true" />
        <span dir="auto" className={`text-truncate flex-grow-1 ${item.placeholder ? 'fst-italic' : ''}`}>{item.label}</span>
        {item.count !== undefined && <span className="compact-count">{formatNumber(item.count)}</span>}
      </button>
      {item.entry && <EntryMenuButton entry={item.entry} name={item.label} className="compact-entry-menu" iconSize={15} />}
    </div>
  );
};

/** Sidebar with collapsible lists; the whole sidebar folds to a narrow strip of shortcut icons. */
export const CompactSidebar: React.FC = () => {
  const { t } = useTranslation();
  const sections = useSidebarSections();
  const collapsed = useUiSettings((state) => state.sidebarCollapsed);
  const update = useUiSettings((state) => state.update);

  if (collapsed) {
    const shortcuts = sections.find((section) => section.id === 'shortcuts')!;
    return (
      <aside className="compact-sidebar collapsed">
        <IconButton
          icon={PanelLeftOpen}
          label={t('sidebar.expandSidebar')}
          placement="right"
          className="compact-icon-btn flip-rtl"
          aria-expanded={false}
          onClick={() => update({ sidebarCollapsed: false })}
        />
        {shortcuts.items.map((item) => (
          <IconButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            placement="right"
            active={item.active}
            className={`compact-icon-btn ${item.active ? '' : item.iconClass}`}
            onClick={item.select}
          />
        ))}
      </aside>
    );
  }

  return (
    <aside className="compact-sidebar">
      <div className="d-flex justify-content-end">
        <IconButton
          icon={PanelLeftClose}
          label={t('sidebar.collapseSidebar')}
          placement="right"
          className="compact-icon-btn flip-rtl"
          aria-expanded
          onClick={() => update({ sidebarCollapsed: true })}
        />
      </div>
      {sections.map((section) => (
        <SidebarSection
          key={section.id}
          section={section}
          className="compact-section"
          badge={section.count !== undefined && <span className="compact-count">{section.count}</span>}
        >
          {section.items.length === 0 && section.emptyText
            ? <p className="text-muted small fst-italic m-1">{section.emptyText}</p>
            : section.items.map((item) => <CompactEntry key={item.key} item={item} />)}
        </SidebarSection>
      ))}
    </aside>
  );
};

/** A thin strip: count, small thumbnails and icon actions. */
const CompactTray: React.FC<TrayHandlers> = (handlers) => {
  const { t } = useTranslation();
  const tray = useTray(handlers);
  if (tray.photos.length === 0) return null;
  return (
    <div className="compact-tray">
      <span className="photo-tray-count fw-bold">{t('common.photos', { count: tray.photos.length })}</span>
      {tray.singlePlace !== null && (
        <span className="compact-tray-place text-truncate" title={tray.singlePlace}>
          <MapPin size={13} aria-hidden="true" /> <span dir="auto">{tray.singlePlace}</span>
        </span>
      )}
      <div className="photo-tray-thumbnails">
        {tray.photos.map((photo) => (
          <span key={photo.id} className="position-relative d-inline-block">
            <img
              src={photo.thumbnailUrl}
              alt={photo.filename}
              className="photo-tray-thumb"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(PHOTO_DRAG_TYPE, String(photo.id));
                e.dataTransfer.effectAllowed = 'copy';
              }}
            />
            <button
              type="button"
              className="photo-tray-remove position-absolute top-0 end-0 border-0 rounded-circle d-flex align-items-center justify-content-center p-0"
              onClick={() => tray.removePhoto(photo.id)}
              title={t('tray.removeFromTray')}
              aria-label={t('tray.removeFromTray')}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      {tray.error != null && (
        <Alert variant="danger" className="position-absolute bottom-100 start-0 end-0 m-2 py-2" dismissible onClose={tray.clearError}>
          {describeError(tray.error, t)}
        </Alert>
      )}
      <div className="photo-tray-actions ms-auto">
        {tray.actions.map(({ id, label, icon, run }) => (
          <IconButton key={id} icon={icon} label={label} placement="top" className={`compact-icon-btn compact-tray-${id}`} onClick={run} data-action={id} />
        ))}
      </div>
      {tray.dialogs}
    </div>
  );
};

const CompactShell: React.FC<AppShellProps> = ({ view, tray, children }) => {
  const trayShown = usePalomaStore((state) => state.selectedPhotos.length > 0);
  return (
    <div className={`compact-shell d-flex flex-column vh-100 overflow-hidden ${trayShown ? 'pal-tray-space' : ''}`}>
      <CompactToolbar />
      {view === 'library' ? (
        <div className="d-flex flex-grow-1 overflow-hidden">
          <CompactSidebar />
          <main className="compact-main flex-grow-1 d-flex flex-column overflow-hidden">{children}</main>
        </div>
      ) : children}
      <CompactTray {...tray} />
    </div>
  );
};

const CompactGrid: React.FC<PhotoGridProps> = ({ photos, onStarToggle }) => {
  const renderCard = useCallback(
    (photo: Photo, open: () => void) => <SquarePhotoCard className="compact-card" iconSize={15} photo={photo} onStarToggle={onStarToggle} onOpen={open} />,
    [onStarToggle],
  );
  return (
    <VirtualGrid
      className="p-1"
      photos={photos}
      columnWidth={compact.grid.columnWidth}
      captionHeight={compact.grid.captionHeight}
      gap={6}
      renderCard={renderCard}
    />
  );
};

/** Thin bars over the photo, on the edges chosen in Settings. */
const CompactViewerChrome: React.FC<ViewerChromeProps> = (props) => <ViewerChrome {...props} className="compact-viewer" />;

export const components: SkinComponents = { AppShell: CompactShell, PhotoGrid: CompactGrid, ViewerChrome: CompactViewerChrome };
