import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert, ListGroup } from 'react-bootstrap';
import { BookImage, Plus } from 'lucide-react';
import type { Album } from '../../../shared/types.js';
import { albumRequest, fetchAlbums } from '../api/albums.js';

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    setSelected(NEW_ALBUM);
    setNewName('');
    setError(null);
    fetchAlbums().then(setAlbums).catch((err) => setError((err as Error).message));
  }, [show]);

  const canSave = !saving && (selected !== NEW_ALBUM || newName.trim() !== '');

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (selected === NEW_ALBUM) await albumRequest('POST', '/api/albums', { name: newName, photoIds });
      else await albumRequest('POST', `/api/albums/${selected}/photos`, { photoIds });
      onDone();
      onHide();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Додати {photoIds.length} світлин до альбому</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <ListGroup className="mb-2">
          <ListGroup.Item action active={selected === NEW_ALBUM} onClick={() => setSelected(NEW_ALBUM)} className="d-flex align-items-center gap-2 fs-5">
            <Plus size={20} />
            <span>Новий альбом</span>
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
                <span className={`text-truncate ${album.name === null ? 'fst-italic' : ''}`}>{album.name ?? 'Без назви'}</span>
              </span>
              <span className="badge bg-secondary rounded-pill">{album.photoCount}</span>
            </ListGroup.Item>
          ))}
        </ListGroup>
        {selected === NEW_ALBUM && (
          <Form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Form.Label className="fw-bold">Назва нового альбому</Form.Label>
            <Form.Control size="lg" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </Form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Скасувати</Button>
        <Button variant="primary" onClick={save} disabled={!canSave}>
          {selected === NEW_ALBUM ? 'Створити альбом' : 'Додати'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
