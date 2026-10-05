import React, { useState, useEffect } from 'react';
import { usePalomaStore } from './store/usePalomaStore.js';
import type { Photo } from '../../shared/types.js';
import { Navbar } from './components/Navbar.js';
import { LeftSidebar } from './components/LeftSidebar.js';
import { VirtualPhotoGrid } from './components/VirtualPhotoGrid.js';
import { PhotoTray } from './components/PhotoTray.js';
import { PhotoViewer } from './components/viewer/PhotoViewer.js';
import { ExportWizardModal } from './components/ExportWizardModal.js';
import { PrintModal } from './components/PrintModal.js';
import { MovieMakerModal } from './components/MovieMakerModal.js';
import { CollageBuilder } from './components/CollageBuilder.js';
import { PlacesMap } from './components/PlacesMap.js';
import { PeopleView } from './components/PeopleView.js';
import { PluginsView } from './components/PluginsView.js';
import { SettingsView } from './components/SettingsView.js';
import { AlbumHeader } from './components/AlbumHeader.js';
import { libraryQueryParams } from './api/library.js';
import { currentLanguage } from './i18n/index.js';
import { useTranslation } from 'react-i18next';

export const App: React.FC = () => {
  const {
    currentView, selectedFolderId, selectedFilter, selectedAlbumToken, searchQuery, libraryVersion,
  } = usePalomaStore();

  const { i18n } = useTranslation();
  const [photosList, setPhotosList] = useState<Photo[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showMovieModal, setShowMovieModal] = useState(false);

  const fetchPhotos = async () => {
    try {
      const params = libraryQueryParams(
        { selectedFolderId, selectedAlbumToken, selectedFilter, searchQuery }, currentLanguage(),
      );

      const res = await fetch(`/api/photos?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPhotosList(data);
      }
    } catch (err) {
      console.error('Failed to fetch photos:', err);
    }
  };

  useEffect(() => {
    fetchPhotos();
  }, [selectedFolderId, selectedFilter, selectedAlbumToken, searchQuery, libraryVersion, i18n.language]);

  const handleStarToggle = async (photoId: number, currentStarred: boolean) => {
    try {
      const res = await fetch(`/api/photos/${photoId}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: !currentStarred }),
      });
      if (res.ok) {
        fetchPhotos();
      }
    } catch (err) {
      console.error('Failed to toggle star:', err);
    }
  };

  if (currentView === 'collage') {
    return <CollageBuilder />;
  }

  if (currentView === 'people') {
    return <PeopleView />;
  }

  // The tray stays under the map, so selected photos can be dragged onto it
  const content = currentView === 'map'
    ? <PlacesMap />
    : currentView === 'plugins' || currentView === 'settings'
      ? (
        <>
          <Navbar />
          {currentView === 'plugins' ? <PluginsView /> : <SettingsView />}
        </>
      )
      : (
      <>
        <Navbar />

        <div className="d-flex flex-grow-1 overflow-hidden" style={{ marginBottom: '80px' }}>
          <LeftSidebar />
          <main className="flex-grow-1 bg-light d-flex flex-column overflow-hidden">
            {selectedAlbumToken !== null && <AlbumHeader token={selectedAlbumToken} />}
            <VirtualPhotoGrid photos={photosList} onStarToggle={handleStarToggle} />
          </main>
        </div>
      </>
    );

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      {content}

      <PhotoTray
        onOpenExport={() => setShowExportModal(true)}
        onOpenPrint={() => setShowPrintModal(true)}
        onOpenMovie={() => setShowMovieModal(true)}
      />

      <ExportWizardModal
        show={showExportModal}
        onHide={() => setShowExportModal(false)}
      />

      <PrintModal
        show={showPrintModal}
        onHide={() => setShowPrintModal(false)}
      />

      <MovieMakerModal
        show={showMovieModal}
        onHide={() => setShowMovieModal(false)}
      />

      {/* Over whatever view opened it, which stays mounted with its scroll position */}
      <PhotoViewer />
    </div>
  );
};
