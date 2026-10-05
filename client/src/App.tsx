import React, { useState } from 'react';
import { usePalomaStore } from './store/usePalomaStore.js';
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
import { useLibraryPhotos } from './shell/useLibraryPhotos.js';
import { useAppearanceSync, useSkin } from './appearance/runtime.js';

/** The library: the album's header, if one is open, over the skin's photo grid. */
const Library: React.FC = () => {
  const selectedAlbumToken = usePalomaStore((state) => state.selectedAlbumToken);
  const { components: { PhotoGrid } } = useSkin();
  const { photos, toggleStar } = useLibraryPhotos();
  return (
    <>
      {selectedAlbumToken !== null && <AlbumHeader token={selectedAlbumToken} />}
      <PhotoGrid photos={photos} onStarToggle={toggleStar} />
    </>
  );
};

export const App: React.FC = () => {
  useAppearanceSync();
  const currentView = usePalomaStore((state) => state.currentView);
  const { components: { AppShell } } = useSkin();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showMovieModal, setShowMovieModal] = useState(false);

  if (currentView === 'collage') {
    return <CollageBuilder />;
  }

  if (currentView === 'people') {
    return <PeopleView />;
  }

  const content = {
    library: <Library />,
    map: <PlacesMap />,
    plugins: <PluginsView />,
    settings: <SettingsView />,
  }[currentView];

  return (
    <>
      <AppShell
        view={currentView}
        tray={{
          onOpenExport: () => setShowExportModal(true),
          onOpenPrint: () => setShowPrintModal(true),
          onOpenMovie: () => setShowMovieModal(true),
        }}
      >
        {content}
      </AppShell>

      <ExportWizardModal show={showExportModal} onHide={() => setShowExportModal(false)} />
      <PrintModal show={showPrintModal} onHide={() => setShowPrintModal(false)} />
      <MovieMakerModal show={showMovieModal} onHide={() => setShowMovieModal(false)} />

      {/* Over whatever view opened it, which stays mounted with its scroll position */}
      <PhotoViewer />
    </>
  );
};
