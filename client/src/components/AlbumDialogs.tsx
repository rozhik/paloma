import React, { useEffect, useState } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { Album } from '../../../shared/types.js';
import { apiRequest, describeError } from '../api/http.js';
import { usePalomaStore } from '../store/usePalomaStore.js';
import { AlbumPropertiesModal } from './AlbumPropertiesModal.js';

/** Which album dialog is open: editing its properties, or confirming that it is deleted. */
export type AlbumDialog = 'properties' | 'delete';

/** Deletes the album; the library reloads, and an open album that is gone goes back to all photos. */
export async function deleteAlbum(token: string): Promise<void> {
  await apiRequest('DELETE', `/api/albums/${token}`);
  usePalomaStore.getState().bumpLibrary();
}

interface AlbumDialogsProps {
  album: Album | null;
  /** The open dialog; null when none is */
  open: AlbumDialog | null;
  onClose: () => void;
}

/**
 * The album's Edit properties and Delete dialogs, the same from its header and from its sidebar menu. A failed
 * delete keeps the confirmation open with the error.
 */
export const AlbumDialogs: React.FC<AlbumDialogsProps> = ({ album, open, onClose }) => {
  const { t } = useTranslation();
  const bumpLibrary = usePalomaStore((state) => state.bumpLibrary);
  const [error, setError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => setError(null), [open]);

  if (!album) return null;

  const confirmDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteAlbum(album.token);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <AlbumPropertiesModal album={album} show={open === 'properties'} onHide={onClose} onSaved={bumpLibrary} />

      <Modal show={open === 'delete'} onHide={onClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('album.deleteTitle')}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="fs-5">
          {t('album.deleteBody', { name: album.name ?? t('common.untitled') })}
          {error != null && <Alert variant="danger" className="mt-3 mb-0">{describeError(error, t)}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={deleting} onClick={confirmDelete}>{t('album.deleteConfirm')}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
