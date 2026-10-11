import React, { useState } from 'react';
import { ButtonGroup, ToggleButton } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import type { Person, Photo } from '../../../shared/types.js';
import { useFormat } from '../i18n/format.js';
import { useAllows } from '../levels/controls.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { SlideshowButton } from '../components/slideshow/SlideshowButton.js';
import { FaceDetectionButton } from '../faces/FaceDetectionButton.js';
import { PersonAvatar } from './PersonAvatar.js';
import { PersonEditorModal } from './PersonEditor.js';

interface PersonHeaderProps {
  person: Person;
  /** The person's photos as the grid shows them */
  photos: Photo[];
  onSaved: (person: Person) => void;
}

/** Above the grid of a person: avatar, name, alias and photo count, editing, and Photos / Similar faces. */
export const PersonHeader: React.FC<PersonHeaderProps> = ({ person, photos, onSaved }) => {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const { bumpLibrary, setSelectedFilter, personMode, setPersonMode } = usePalomaStore();
  const canEdit = useAllows('people.edit');
  const canSimilar = useAllows('faces.similar');
  const [editing, setEditing] = useState(false);

  const mode = canSimilar ? personMode : 'photos';
  return (
    <div className="album-header person-header pal-surface border-bottom px-4 py-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
      <div className="d-flex align-items-center gap-3 min-w-0">
        <PersonAvatar id={person.id} version={person.avatarVersion} size={48} />
        <div className="min-w-0">
          <h4 className="fw-bold mb-0 d-flex align-items-center gap-2 text-truncate">
            <span dir="auto" className={`text-truncate ${person.name === null ? 'fst-italic' : ''}`}>{person.name ?? t('people.unknown')}</span>
            <span className="badge pal-badge fs-6">{formatNumber(mode === 'photos' ? photos.length : person.photoCount)}</span>
          </h4>
          {person.alias && <div dir="auto" className="opacity-75 text-truncate">{person.alias}</div>}
          {person.user && (
            <div className="opacity-75 text-truncate">{t('people.isUser', { name: person.user.displayName, username: person.user.username })}</div>
          )}
        </div>
        {canEdit && (
          <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(true)}>
            <Pencil size={18} /> {t('people.edit')}
          </button>
        )}
      </div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {canSimilar && (
          <ButtonGroup aria-label={t('people.modes')}>
            {(['photos', 'similar'] as const).map((value) => (
              <ToggleButton
                key={value}
                id={`person-mode-${value}`}
                type="radio"
                variant="outline-primary"
                name="person-mode"
                value={value}
                checked={mode === value}
                onChange={() => setPersonMode(value)}
              >
                {value === 'photos' ? t('people.modePhotos') : t('people.modeSimilar')}
              </ToggleButton>
            ))}
          </ButtonGroup>
        )}
        {mode === 'photos' && <FaceDetectionButton photos={photos} />}
        {mode === 'photos' && <SlideshowButton photos={photos} />}
      </div>
      <PersonEditorModal
        show={editing}
        person={person}
        onHide={() => setEditing(false)}
        onSaved={(saved) => { onSaved(saved); bumpLibrary(); }}
        onDeleted={() => { setSelectedFilter('all'); bumpLibrary(); }}
      />
    </div>
  );
};
