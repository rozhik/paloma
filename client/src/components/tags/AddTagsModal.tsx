import React, { useEffect, useState } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { Photo } from '../../../../shared/types.js';
import { changePhotosTags, fetchTags } from '../../api/tags.js';
import { describeError } from '../../api/http.js';
import { TagChips } from './TagChips.js';

interface AddTagsModalProps {
  show: boolean;
  photoIds: number[];
  onHide: () => void;
  /** Called with the updated photos after the tags were added */
  onDone: (photos: Photo[]) => void;
}

/** Adds one or more tags, entered as chips, to the selected photos. */
export const AddTagsModal: React.FC<AddTagsModalProps> = ({ show, photoIds, onHide, onDone }) => {
  const { t } = useTranslation();
  const [tags, setTags] = useState<string[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    setTags([]);
    setError(null);
    fetchTags().then((list) => setKnown(list.map((tag) => tag.name))).catch(() => setKnown([]));
  }, [show]);

  const save = async () => {
    if (tags.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await changePhotosTags(photoIds, { add: tags }));
      onHide();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t('tags.addTitle', { count: photoIds.length })}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error != null && <Alert variant="danger">{describeError(error, t)}</Alert>}
        <TagChips tags={tags} onChange={setTags} suggestions={known} disabled={saving} autoFocus />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={tags.length === 0 || saving}>{t('tags.addConfirm')}</Button>
      </Modal.Footer>
    </Modal>
  );
};
