import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X } from 'lucide-react';
import type { Person } from '../../../shared/types.js';
import { describeError } from '../api/http.js';
import { createPerson, deletePerson, updatePerson } from '../api/people.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { AvatarPicker } from './AvatarPicker.js';
import { formOf, inputOf, isKnown, type PersonForm } from './personForm.js';

interface PersonEditorFormProps {
  /** The person being edited; null for a new one */
  person: Person | null;
  form: PersonForm;
  onChange: (form: PersonForm) => void;
  disabled?: boolean;
}

/**
 * The person editor's fields. An unknown person offers only the name; once a name is typed, or for a known
 * person, the whole profile.
 */
export const PersonEditorForm: React.FC<PersonEditorFormProps> = ({ person, form, onChange, disabled }) => {
  const { t } = useTranslation();
  const set = (patch: Partial<PersonForm>) => onChange({ ...form, ...patch });
  const known = isKnown(person) || form.name.trim() !== '';
  const setLink = (index: number, value: string) => set({ links: form.links.map((link, i) => (i === index ? value : link)) });

  return (
    <fieldset disabled={disabled}>
      <Form.Group className="mb-3" controlId="person-name">
        <Form.Label>{t('people.name')}</Form.Label>
        <Form.Control
          type="text"
          dir="auto"
          value={form.name}
          placeholder={person && !isKnown(person) ? t('people.unknown') : t('people.namePlaceholder')}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={200}
          autoFocus
        />
        {person === null && <Form.Text>{t('people.nameOptional')}</Form.Text>}
      </Form.Group>

      {known && (
        <>
          <Form.Group className="mb-3" controlId="person-alias">
            <Form.Label>{t('people.alias')}</Form.Label>
            <Form.Control type="text" dir="auto" value={form.alias} maxLength={200} onChange={(e) => set({ alias: e.target.value })} />
          </Form.Group>

          <Form.Group className="mb-3" controlId="person-comment">
            <Form.Label>{t('people.comment')}</Form.Label>
            <Form.Control as="textarea" rows={2} dir="auto" value={form.comment} maxLength={5000} onChange={(e) => set({ comment: e.target.value })} />
          </Form.Group>

          <fieldset className="mb-3">
            <legend className="form-label fs-6">{t('people.links')}</legend>
            {form.links.map((link, index) => (
              <div key={index} className="d-flex gap-2 mb-2">
                <Form.Control
                  type="url"
                  dir="ltr"
                  value={link}
                  placeholder="https://"
                  aria-label={t('people.link', { index: index + 1 })}
                  onChange={(e) => setLink(index, e.target.value)}
                />
                <Button
                  variant="outline-secondary"
                  aria-label={t('people.removeLink', { index: index + 1 })}
                  title={t('people.removeLink', { index: index + 1 })}
                  onClick={() => set({ links: form.links.length > 1 ? form.links.filter((_, i) => i !== index) : [''] })}
                >
                  <X size={18} />
                </Button>
              </div>
            ))}
            {form.links.length < 20 && (
              <Button variant="outline-secondary" size="sm" onClick={() => set({ links: [...form.links, ''] })}>
                <Plus size={16} /> {t('people.addLink')}
              </Button>
            )}
          </fieldset>

          <fieldset className="mb-3">
            <legend className="form-label fs-6">{t('people.birth')}</legend>
            <div className="d-flex gap-3 mb-2">
              <Form.Check
                type="radio"
                id="person-birth-year"
                name="person-birth-kind"
                label={t('people.birthYear')}
                checked={form.birthKind === 'year'}
                onChange={() => set({ birthKind: 'year', birth: form.birth.slice(0, 4) })}
              />
              <Form.Check
                type="radio"
                id="person-birth-date"
                name="person-birth-kind"
                label={t('people.birthDate')}
                checked={form.birthKind === 'date'}
                onChange={() => set({ birthKind: 'date', birth: '' })}
              />
            </div>
            {form.birthKind === 'year'
              ? (
                <Form.Control
                  type="number" min={1000} max={new Date().getFullYear()} inputMode="numeric" value={form.birth}
                  aria-label={t('people.birthYear')} onChange={(e) => set({ birth: e.target.value })}
                />
              )
              : (
                <Form.Control
                  type="date" max={new Date().toISOString().slice(0, 10)} value={form.birth}
                  aria-label={t('people.birthDate')} onChange={(e) => set({ birth: e.target.value })}
                />
              )}
          </fieldset>

          <Form.Group className="mb-3" controlId="person-gender">
            <Form.Label>{t('people.gender')}</Form.Label>
            <Form.Select value={form.gender} onChange={(e) => set({ gender: e.target.value as PersonForm['gender'] })}>
              <option value="">{t('people.genderUnset')}</option>
              <option value="female">{t('people.female')}</option>
              <option value="male">{t('people.male')}</option>
            </Form.Select>
          </Form.Group>

          {person && (
            <fieldset className="mb-1">
              <legend className="form-label fs-6">{t('people.avatar')}</legend>
              <AvatarPicker
                personId={person.id}
                chosen={form.avatar === undefined ? person.avatar : form.avatar}
                onChoose={(avatar) => set({ avatar })}
              />
            </fieldset>
          )}
        </>
      )}
    </fieldset>
  );
};

interface PersonEditorModalProps {
  show: boolean;
  /** The person to edit; null to add a person */
  person: Person | null;
  onHide: () => void;
  /** After a save, with the saved person */
  onSaved: (person: Person) => void;
  /** After the person was deleted; without it, the editor offers no Delete */
  onDeleted?: () => void;
}

/** Adds or edits a person. Profiles live in the library only: saving never changes a file. */
export const PersonEditorModal: React.FC<PersonEditorModalProps> = ({ show, person, onHide, onSaved, onDeleted }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<PersonForm>(formOf(person));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!show) return;
    setForm(formOf(person));
    setError(null);
  }, [show, person]);

  const save = async () => {
    const input = inputOf(form, person);
    if (person && Object.keys(input).length === 0) {
      onHide();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = person ? await updatePerson(person.id, input) : await createPerson(input);
      onSaved(saved);
      onHide();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!person) return;
    setConfirmDelete(false);
    setSaving(true);
    setError(null);
    try {
      await deletePerson(person.id);
      onDeleted?.();
      onHide();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const shownName = person?.name ?? t('people.unknown');
  return (
    <>
      <Modal show={show && !confirmDelete} onHide={onHide} centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title dir="auto">{person ? t('people.editTitle', { name: shownName }) : t('people.addTitle')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error != null && <Alert variant="danger">{describeError(error, t)}</Alert>}
          <Form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <PersonEditorForm person={person} form={form} onChange={setForm} disabled={saving} />
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </Form>
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <div>
            {person && onDeleted && (
              <Button variant="outline-danger" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 size={18} /> {t('people.delete')}
              </Button>
            )}
          </div>
          <div className="d-flex gap-2">
            <Button variant="secondary" onClick={onHide}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{t('common.save')}</Button>
          </div>
        </Modal.Footer>
      </Modal>
      <ConfirmModal
        show={confirmDelete}
        title={t('people.deleteTitle', { name: shownName })}
        body={t('people.deleteBody', { count: person?.photoCount ?? 0 })}
        confirmLabel={t('people.delete')}
        variant="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
};
