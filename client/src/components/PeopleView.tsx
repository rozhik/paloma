import React, { useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, UserPlus, Users } from 'lucide-react';
import type { Person, PersonSummary } from '../../../shared/types.js';
import { describeError } from '../api/http.js';
import { fetchPerson } from '../api/people.js';
import { PersonAvatar } from '../people/PersonAvatar.js';
import { PersonEditorModal } from '../people/PersonEditor.js';
import { sortPeople, usePeople } from '../people/usePeople.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { LAYER, useKeyActions } from '../keys/dispatcher.js';

interface PersonCardsProps {
  people: PersonSummary[];
  onOpen: (person: PersonSummary) => void;
  onEdit: (person: PersonSummary) => void;
}

/** A card per person: avatar, name, alias and photo count; the card opens their photos. */
export const PersonCards: React.FC<PersonCardsProps> = ({ people, onOpen, onEdit }) => {
  const { t } = useTranslation();
  if (people.length === 0) return <p className="text-muted fs-5">{t('people.empty')}</p>;
  return (
    <ul className="person-cards list-unstyled m-0">
      {people.map((person) => {
        const name = person.name ?? t('people.unknown');
        return (
          <li key={person.id} className="card pal-chrome-card person-card text-center">
            <button type="button" className="person-card-open btn p-3 w-100 h-100" onClick={() => onOpen(person)} aria-label={t('people.open', { name })}>
              <PersonAvatar id={person.id} version={person.avatarVersion} size={96} className="mb-2" />
              <span dir="auto" className={`d-block fw-bold text-truncate ${person.name === null ? 'fst-italic' : ''}`}>{name}</span>
              {person.alias && <span dir="auto" className="d-block opacity-75 text-truncate">{person.alias}</span>}
              <span className="d-block small opacity-75">{t('common.photos', { count: person.photoCount })}</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary person-card-edit"
              aria-label={t('people.editTitle', { name })}
              title={t('people.editTitle', { name })}
              onClick={() => onEdit(person)}
            >
              <Pencil size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** Every person of the library: open their photos, add a person by hand, edit or delete one. */
export const PeopleView: React.FC = () => {
  const { setCurrentView, setSelectedPerson, bumpLibrary } = usePalomaStore();
  const { t, i18n } = useTranslation();
  const { people, reload } = usePeople();
  const sorted = useMemo(() => sortPeople(people, i18n.language), [people, i18n.language]);
  const [editing, setEditing] = useState<{ person: Person | null } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const open = (person: PersonSummary) => {
    setSelectedPerson(person.id);
    setCurrentView('library');
  };
  const edit = (person: PersonSummary) => {
    setError(null);
    fetchPerson(person.id).then((full) => setEditing({ person: full })).catch(setError);
  };
  const changed = () => {
    reload();
    bumpLibrary();
  };

  useKeyActions('people', LAYER.screen, {
    'people.back': () => setCurrentView('library'),
    'people.add': () => setEditing({ person: null }),
  });

  return (
    <div className="d-flex flex-column h-100 w-100 pal-chrome p-4 overflow-auto">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4 pal-chrome-panel p-3 rounded">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-outline-light btn-lg-custom" onClick={() => setCurrentView('library')}>
            <ArrowLeft size={20} className="flip-rtl" />
            <span>{t('common.back')}</span>
          </button>
          <h4 className="fw-bold mb-0 d-flex align-items-center gap-2">
            <Users size={24} aria-hidden="true" />
            <span>{t('people.catalog', { count: people.length })}</span>
          </h4>
        </div>
        <button type="button" className="btn btn-primary btn-lg-custom" onClick={() => setEditing({ person: null })}>
          <UserPlus size={20} aria-hidden="true" />
          <span>{t('people.add')}</span>
        </button>
      </div>

      {error != null && <Alert variant="danger" dismissible onClose={() => setError(null)}>{describeError(error, t)}</Alert>}

      <div className="pal-chrome-panel p-4 rounded">
        <PersonCards people={sorted} onOpen={open} onEdit={edit} />
      </div>

      <PersonEditorModal
        show={editing !== null}
        person={editing?.person ?? null}
        onHide={() => setEditing(null)}
        onSaved={changed}
        onDeleted={changed}
      />
    </div>
  );
};
