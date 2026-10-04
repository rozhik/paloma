import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { Album } from '../../../shared/types.js';
import { apiRequest, describeError } from '../api/http.js';

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
  const [error, setError] = useState<unknown>(null);
  const { t } = useTranslation();
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
      await apiRequest('PATCH', `/api/albums/${album.token}`, patch);
      onSaved();
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
        <Modal.Title>{t('albumProperties.title')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error != null && <Alert variant="danger">{describeError(error, t)}</Alert>}
        <Form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">{t('albumProperties.name')}</Form.Label>
            <Form.Control size="lg" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">{t('albumProperties.description')}</Form.Label>
            <Form.Control as="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Form.Group>
          <Form.Group>
            <Form.Label className="fw-bold">
              {t('albumProperties.location')} <span className="text-muted fw-normal">{t('albumProperties.optional')}</span>
            </Form.Label>
            <Form.Control value={location} onChange={(e) => setLocation(e.target.value)} />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={saving || (name !== (album.name ?? '') && name.trim() === '')}>
          {t('common.save')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
