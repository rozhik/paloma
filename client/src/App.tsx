import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePalomaStore } from './store/usePalomaStore.js';
import { PhotoViewer } from './components/viewer/PhotoViewer.js';
import { ExportWizardModal } from './components/ExportWizardModal.js';
import { PrintModal } from './components/PrintModal.js';
import { MovieMakerModal } from './components/MovieMakerModal.js';
import { CollageBuilder } from './components/CollageBuilder.js';
import { PlacesMap } from './components/PlacesMap.js';
import { PeopleView } from './components/PeopleView.js';
import { SettingsView } from './components/SettingsView.js';
import { AdminView } from './admin/AdminView.js';
import { AccountView } from './auth/AccountView.js';
import { ServerSettingsView } from './components/ServerSettingsView.js';
import { AlbumHeader } from './components/AlbumHeader.js';
import { LibraryHeader } from './components/LibraryHeader.js';
import { TagHeader } from './components/TagHeader.js';
import { MemoryHeader } from './memories/MemoryHeader.js';
import { PersonHeader } from './people/PersonHeader.js';
import { usePerson } from './people/usePerson.js';
import { SimilarFaces } from './faces/SimilarFaces.js';
import { UnrecognizedFaces } from './faces/UnrecognizedFaces.js';
import { TaskIndicator } from './tasks/TaskIndicator.js';
import { TasksView } from './tasks/TasksView.js';
import { Slideshow } from './components/slideshow/Slideshow.js';
import { useLibraryPhotos } from './shell/useLibraryPhotos.js';
import { useAppearanceSync, useSkin } from './appearance/runtime.js';
import { allows, useLevel } from './levels/controls.js';
import { usePinGate } from './levels/pinGate.js';
import { SettingsPinDialog } from './levels/PinDialog.js';
import { useAppKeys } from './keys/useAppKeys.js';
import { KeybindingsView } from './keys/KeybindingsView.js';

/**
 * The library: the album's, tag's, memory's or person's header if one is open, else a header with the slideshow, over the
 * skin's photo grid, or a person's similar faces.
 */
const Library: React.FC = () => {
  const selectedAlbumToken = usePalomaStore((state) => state.selectedAlbumToken);
  const selectedTag = usePalomaStore((state) => state.selectedTag);
  const selectedMemory = usePalomaStore((state) => state.selectedMemory);
  const selectedPerson = usePalomaStore((state) => state.selectedPerson);
  const personMode = usePalomaStore((state) => state.personMode);
  const selectedUnrecognized = usePalomaStore((state) => state.selectedUnrecognized);
  const level = useLevel();
  const canChoosePerson = allows(level, 'people.choose');
  const canSimilar = allows(level, 'faces.similar');
  const { person, setPerson } = usePerson(canChoosePerson ? selectedPerson : null);
  const { components: { PhotoGrid } } = useSkin();
  const { t } = useTranslation();
  const { photos, toggleStar } = useLibraryPhotos();
  if (selectedUnrecognized && allows(level, 'faces.unrecognized')) return <UnrecognizedFaces />;
  const header = selectedAlbumToken !== null
    ? <AlbumHeader token={selectedAlbumToken} photos={photos} />
    : selectedTag !== null ? <TagHeader tag={selectedTag} photos={photos} />
    : selectedMemory !== null ? <MemoryHeader memory={selectedMemory} photos={photos} />
    : person !== null ? <PersonHeader person={person} photos={photos} onSaved={setPerson} />
    : photos.length > 0 ? <LibraryHeader photos={photos} /> : null;
  return (
    <>
      {header}
      {person !== null && canSimilar && personMode === 'similar'
        ? <SimilarFaces personId={person.id} name={person.name ?? t('people.unknown')} />
        : <PhotoGrid photos={photos} belowHeader={header !== null} onStarToggle={toggleStar} />}
    </>
  );
};

export const App: React.FC = () => {
  useAppearanceSync();
  useAppKeys();
  const level = useLevel();
  const settingsUnlocked = usePinGate((state) => state.unlocked);
  const chosenView = usePalomaStore((state) => state.currentView);
  // A view the level does not offer, or Settings at Child before the PIN, shows the library instead
  const currentView = !allows(level, `view.${chosenView}`) || (chosenView === 'settings' && level === 'child' && !settingsUnlocked)
    ? 'library'
    : chosenView;
  const { components: { AppShell } } = useSkin();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showMovieModal, setShowMovieModal] = useState(false);

  // Child cannot use these dialogs; close them if they were open when the level changed
  useEffect(() => {
    if (level !== 'child') return;
    setShowExportModal(false);
    setShowPrintModal(false);
    setShowMovieModal(false);
  }, [level]);

  if (currentView === 'collage') {
    return <CollageBuilder />;
  }

  if (currentView === 'people') {
    return <PeopleView />;
  }

  const content = {
    library: <Library />,
    map: <PlacesMap />,
    settings: <SettingsView />,
    keybindings: <KeybindingsView />,
    admin: <AdminView />,
    account: <AccountView />,
    tasks: <TasksView />,
    server: <ServerSettingsView />,
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
      <TaskIndicator />

      <PhotoViewer />

      <Slideshow />

      <SettingsPinDialog />
    </>
  );
};
