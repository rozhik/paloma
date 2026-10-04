import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import type { Album } from '../../../shared/types.js';
import { albumRequest } from '../api/albums.js';

interface AlbumPropertiesModalProps {
  album: Album;
  show: boolean;
  onHide: () => void;
  onSaved: () => void;
}

export const AlbumPropertiesModal: React.FC<AlbumPropertiesModalProps> = ({ album, show, onHide, onSaved }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) return;
    setName(album.name ?? '');
    setDescription(album.description ?? '');
    setLocation(album.location ?? '');
    setError(null);
  }, [show, album]);

  const save = async () => {
    // Only changed fields are sent, so an untitled album can get a description without a name
    const patch: Record<string, string> = {};
    if (name !== (album.name ?? '')) patch.name = name;
    if (description !== (album.description ?? '')) patch.description = description;
    if (location !== (album.location ?? '')) patch.location = location;
    if (Object.keys(patch).length === 0) {
      onHide();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await albumRequest('PATCH', `/api/albums/${album.token}`, patch);
      onSaved();
      onHide();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Властивості альбому</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Назва</Form.Label>
            <Form.Control size="lg" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Опис</Form.Label>
            <Form.Control as="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Form.Group>
          <Form.Group>
            <Form.Label className="fw-bold">Місце <span className="text-muted fw-normal">(необов'язково)</span></Form.Label>
            <Form.Control value={location} onChange={(e) => setLocation(e.target.value)} />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Скасувати</Button>
        <Button variant="primary" onClick={save} disabled={saving || (name !== (album.name ?? '') && name.trim() === '')}>
          Зберегти
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
