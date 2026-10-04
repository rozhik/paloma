import React, { useEffect, useState } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import { BookImage, MapPin, Pencil, Trash2 } from 'lucide-react';
import type { Album } from '../../../shared/types.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { albumRequest, fetchAlbums } from '../api/albums.js';
import { AlbumPropertiesModal } from './AlbumPropertiesModal.js';

interface AlbumHeaderProps {
  token: string;
}

export const AlbumHeader: React.FC<AlbumHeaderProps> = ({ token }) => {
  const { libraryVersion, bumpLibrary, setSelectedFilter } = usePalomaStore();
  const [album, setAlbum] = useState<Album | null>(null);
  const [showProperties, setShowProperties] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlbums()
      .then((albums) => {
        if (cancelled) return;
        const found = albums.find((a) => a.token === token);
        // The album is gone (deleted, or its last photo removed): go back to all photos
        if (!found) setSelectedFilter('all');
        else setAlbum(found);
      })
      .catch((err) => console.error('Failed to fetch albums:', err));
    return () => { cancelled = true; };
  }, [token, libraryVersion]);

  const deleteAlbum = async () => {
    setError(null);
    try {
      await albumRequest('DELETE', `/api/albums/${token}`);
      setConfirmDelete(false);
      bumpLibrary();
    } catch (err) {
      setConfirmDelete(false);
      setError((err as Error).message);
    }
  };

  if (!album) return null;

  return (
    <div className="bg-white border-bottom px-4 py-3">
      <div className="d-flex align-items-start justify-content-between gap-3">
        <div className="text-truncate">
          <h4 className="fw-bold mb-1 d-flex align-items-center gap-2">
            <BookImage size={24} className="text-primary flex-shrink-0" />
            <span className={`text-truncate ${album.name === null ? 'fst-italic' : ''}`}>{album.name ?? 'Без назви'}</span>
            <span className="badge bg-secondary fs-6">{album.photoCount}</span>
          </h4>
          {album.description && <p className="mb-1 fs-5 text-body-secondary" style={{ whiteSpace: 'pre-line' }}>{album.description}</p>}
          {album.location && (
            <p className="mb-0 text-muted d-flex align-items-center gap-1"><MapPin size={16} /> {album.location}</p>
          )}
        </div>
        <div className="d-flex gap-2 flex-shrink-0">
          <button className="btn btn-outline-primary btn-lg-custom" onClick={() => setShowProperties(true)}>
            <Pencil size={18} />
            <span>Властивості</span>
          </button>
          <button className="btn btn-outline-danger btn-lg-custom" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} />
            <span>Видалити</span>
          </button>
        </div>
      </div>
      {error && <Alert variant="danger" className="mt-3 mb-0" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <AlbumPropertiesModal album={album} show={showProperties} onHide={() => setShowProperties(false)} onSaved={bumpLibrary} />

      <Modal show={confirmDelete} onHide={() => setConfirmDelete(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Видалити альбом?</Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5">
          Альбом «{album.name ?? 'Без назви'}» буде видалено. Світлини залишаться у своїх папках.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Скасувати</Button>
          <Button variant="danger" onClick={deleteAlbum}>Видалити альбом</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};
