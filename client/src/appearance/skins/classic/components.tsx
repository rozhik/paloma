import React, { useCallback } from 'react';
import './classic.css';
import { VirtualGrid } from '../../../shell/VirtualGrid.js';
import { usePalomaStore } from '../../../store/usePalomaStore.js';
import { ViewerChrome } from '../../../components/viewer/ViewerChrome.js';
import type { AppShellProps, PhotoGridProps, SkinComponents } from '../types.js';
import { ClassicNavbar } from './ClassicNavbar.js';
import { ClassicSidebar } from './ClassicSidebar.js';
import { ClassicTray } from './ClassicTray.js';
import { ClassicPhotoCard } from './ClassicPhotoCard.js';
import { classic } from './index.js';

/** Navigation bar on top, sidebar on the left in the library, photo tray along the bottom. */
const ClassicShell: React.FC<AppShellProps> = ({ view, tray, children }) => {
  const trayShown = usePalomaStore((state) => state.selectedPhotos.length > 0);
  return (
  <div className={`classic-shell d-flex flex-column vh-100 overflow-hidden ${trayShown ? 'pal-tray-space' : ''}`}>
    {view !== 'map' && <ClassicNavbar />}
    {view === 'library' ? (
      <div className="classic-body d-flex flex-grow-1 overflow-hidden">
        <ClassicSidebar />
        <main className="classic-main flex-grow-1 d-flex flex-column overflow-hidden">{children}</main>
      </div>
    ) : children}
    <ClassicTray {...tray} />
  </div>
  );
};

/** Large cards with the file name under the thumbnail. */
const ClassicGrid: React.FC<PhotoGridProps> = ({ photos, onStarToggle }) => {
  const renderCard = useCallback(
    (photo: PhotoGridProps['photos'][number], open: () => void) => <ClassicPhotoCard photo={photo} onStarToggle={onStarToggle} onOpen={open} />,
    [onStarToggle],
  );
  return (
    <VirtualGrid
      className="p-2"
      photos={photos}
      columnWidth={classic.grid.columnWidth}
      captionHeight={classic.grid.captionHeight}
      gap={16}
      renderCard={renderCard}
    />
  );
};

export const components: SkinComponents = { AppShell: ClassicShell, PhotoGrid: ClassicGrid, ViewerChrome };
