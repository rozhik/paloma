import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert, ListGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { BookImage, Plus } from 'lucide-react';
import type { Album } from '../../../shared/types.js';
import { fetchAlbums } from '../api/albums.js';
import { apiRequest, describeError } from '../api/http.js';
import { useFormat } from '../i18n/format.js';

interface AlbumPickerModalProps {
  show: boolean;
  photoIds: number[];
  onHide: () => void;
  onDone: () => void;
}

const NEW_ALBUM = '';

/** Adds photos to an existing album or creates a new album from them. */
export const AlbumPickerModal: React.FC<AlbumPickerModalProps> = ({ show, photoIds, onHide, onDone }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selected, setSelected] = useState<string>(NEW_ALBUM);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    setSelected(NEW_ALBUM);
    setNewName('');
    setError(null);
    fetchAlbums().then(setAlbums).catch(setError);
  }, [show]);

  const canSave = !saving && (selected !== NEW_ALBUM || newName.trim() !== '');

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (selected === NEW_ALBUM) await apiRequest('POST', '/api/albums', { name: newName, photoIds });
      else await apiRequest('POST', `/api/albums/${selected}/photos`, { photoIds });
      onDone();
      onHide();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{t('albumPicker.title', { count: photoIds.length })}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error != null && <Alert variant="danger">{describeError(error, t)}</Alert>}
        <ListGroup className="mb-2">
          <ListGroup.Item action active={selected === NEW_ALBUM} onClick={() => setSelected(NEW_ALBUM)} className="d-flex align-items-center gap-2 fs-5">
            <Plus size={20} />
            <span>{t('albumPicker.newAlbum')}</span>
          </ListGroup.Item>
          {albums.map((album) => (
            <ListGroup.Item
              key={album.token}
              action
              active={selected === album.token}
              onClick={() => setSelected(album.token)}
              className="d-flex align-items-center justify-content-between fs-5"
            >
              <span className="d-flex align-items-center gap-2 text-truncate">
                <BookImage size={20} />
                <span dir="auto" className={`text-truncate ${album.name === null ? 'fst-italic' : ''}`}>{album.name ?? t('common.untitled')}</span>
              </span>
              <span className="badge bg-secondary rounded-pill">{formatNumber(album.photoCount)}</span>
            </ListGroup.Item>
          ))}
        </ListGroup>
        {selected === NEW_ALBUM && (
          <Form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Form.Label className="fw-bold">{t('albumPicker.newAlbumName')}</Form.Label>
            <Form.Control size="lg" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </Form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={!canSave}>
          {selected === NEW_ALBUM ? t('albumPicker.create') : t('albumPicker.add')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
