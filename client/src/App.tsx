import React, { useState, useEffect } from 'react';
import { usePalomaStore } from './store/usePalomaStore.js';
import type { Photo } from '../../shared/types.js';
import { Navbar } from './components/Navbar.js';
import { LeftSidebar } from './components/LeftSidebar.js';
import { VirtualPhotoGrid } from './components/VirtualPhotoGrid.js';
import { PhotoTray } from './components/PhotoTray.js';
import { EditorCanvas } from './components/EditorCanvas.js';
import { ExportWizardModal } from './components/ExportWizardModal.js';
import { PrintModal } from './components/PrintModal.js';
import { MovieMakerModal } from './components/MovieMakerModal.js';
import { CollageBuilder } from './components/CollageBuilder.js';
import { PlacesMap } from './components/PlacesMap.js';
import { PeopleView } from './components/PeopleView.js';
import { AlbumHeader } from './components/AlbumHeader.js';

export const App: React.FC = () => {
  const {
    currentView, activeEditPhoto, selectedFolderId, selectedFilter, selectedAlbumToken, searchQuery, libraryVersion,
  } = usePalomaStore();

  const [photosList, setPhotosList] = useState<Photo[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showMovieModal, setShowMovieModal] = useState(false);

  const fetchPhotos = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedFolderId !== null) params.append('folderId', String(selectedFolderId));
      if (selectedAlbumToken !== null) params.append('album', selectedAlbumToken);
      if (selectedFilter === 'starred') params.append('starred', 'true');
      if (searchQuery.trim()) params.append('query', searchQuery.trim());

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
  }, [selectedFolderId, selectedFilter, selectedAlbumToken, searchQuery, libraryVersion]);

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

  if (currentView === 'editor' && activeEditPhoto) {
    return <EditorCanvas photo={activeEditPhoto} onSaveSuccess={fetchPhotos} />;
  }

  if (currentView === 'collage') {
    return <CollageBuilder />;
  }

  if (currentView === 'map') {
    return <PlacesMap />;
  }

  if (currentView === 'people') {
    return <PeopleView />;
  }

  return (
    <div className="d-flex flex-column vh-100 overflow-hidden">
      <Navbar />

      <div className="d-flex flex-grow-1 overflow-hidden" style={{ marginBottom: '80px' }}>
        <LeftSidebar />
        <main className="flex-grow-1 bg-light d-flex flex-column overflow-hidden">
          {selectedAlbumToken !== null && <AlbumHeader token={selectedAlbumToken} />}
          <VirtualPhotoGrid photos={photosList} onStarToggle={handleStarToggle} />
        </main>
      </div>

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
    </div>
  );
};
