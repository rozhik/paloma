import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, ListGroup, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { UserPlus, UserRound } from 'lucide-react';
import type { PersonSummary } from '../../../shared/types.js';
import { describeError } from '../api/http.js';
import { createPerson, fetchPeople } from '../api/people.js';
import { PersonAvatar } from './PersonAvatar.js';
import { matchPeople } from './personForm.js';
import { sortPeople } from './usePeople.js';

interface PersonPickerProps {
  show: boolean;
  title: string;
  /** People not to offer, e.g. those already on the photo */
  exclude?: readonly string[];
  onHide: () => void;
  /** With the chosen person's contact id and shown name; a new person is created first */
  onPick: (personId: string, name: string | null) => Promise<void> | void;
}

/**
 * Chooses a person: one of the library's, found by name or alias, a new person with the typed name, or a new
 * unknown person.
 */
const NONE: readonly string[] = [];

export const PersonPicker: React.FC<PersonPickerProps> = ({ show, title, exclude = NONE, onHide, onPick }) => {
  const { t, i18n } = useTranslation();
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!show) return;
    setQuery('');
    setError(null);
    fetchPeople().then(setPeople).catch(setError);
  }, [show]);

  const offered = useMemo(
    () => matchPeople(sortPeople(people.filter((person) => !exclude.includes(person.id)), i18n.language), query),
    [people, exclude, query, i18n.language],
  );

  const pick = async (choose: () => Promise<string> | string, chosenName: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await onPick(await choose(), chosenName);
      onHide();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const name = query.trim();

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error != null && <Alert variant="danger">{describeError(error, t)}</Alert>}
        <Form.Control
          type="search"
          dir="auto"
          className="mb-3"
          value={query}
          placeholder={t('people.searchPlaceholder')}
          aria-label={t('people.searchPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && offered.length === 1) {
              e.preventDefault();
              pick(() => offered[0].id, offered[0].name);
            }
          }}
          autoFocus
        />
        <ListGroup className="person-picker-list mb-3">
          {offered.map((person) => (
            <ListGroup.Item key={person.id} action disabled={busy} onClick={() => pick(() => person.id, person.name)} className="d-flex align-items-center gap-2">
              <PersonAvatar id={person.id} version={person.avatarVersion} size={32} />
              <span dir="auto" className={`text-truncate ${person.name === null ? 'fst-italic' : ''}`}>{person.name ?? t('people.unknown')}</span>
              {person.alias && <span dir="auto" className="opacity-75 text-truncate">({person.alias})</span>}
            </ListGroup.Item>
          ))}
          {offered.length === 0 && <ListGroup.Item className="opacity-75">{t('people.noMatches')}</ListGroup.Item>}
        </ListGroup>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy || name === ''} onClick={() => pick(async () => (await createPerson({ name })).id, name)}>
            <UserPlus size={18} /> {name === '' ? t('people.newNamed') : t('people.newNamedAs', { name })}
          </Button>
          <Button variant="outline-secondary" disabled={busy} onClick={() => pick(async () => (await createPerson({})).id, null)}>
            <UserRound size={18} /> {t('people.newUnknown')}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};
